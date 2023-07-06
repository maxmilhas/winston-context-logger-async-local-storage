import { v4 } from 'uuid';
import { ContextInfoProvider } from 'winston-context-logger';
import { AsyncLocalStorage } from 'async_hooks';

const onContextEndList: Array<(routine?: string) => void> = [];

export class RequestContext {
	private static storage = new AsyncLocalStorage();
	readonly privateMeta: {
		[key: symbol]: object;
	} = {};

	constructor(
		public readonly correlationId: string,
		public readonly routine: string,
	) {}

	static setContext(routine: string, correlationId: string | undefined) {
		this.storage.enterWith(new RequestContext(correlationId || v4(), routine));
	}

	subContext(subRoutine: string) {
		return RequestContext.setContext(
			`${this.routine}.${subRoutine}`,
			this.correlationId,
		);
	}

	static get currentContext() {
		return this.storage.getStore() as RequestContext | undefined;
	}

	static flush(): void;
	static flush(routine: string): void;
	static flush(routine?: string) {
		onContextEndList.forEach((callback) => {
			try {
				callback(routine);
			} catch (error) {
				console.error(`Error when calling context end callback ${error.stack}`);
			}
		});
	}
}
const loggerContextSymbol = Symbol('CoggerContext');
const rootContext = new RequestContext('root', 'root');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Func = (...args: any[]) => any;

export class AsyncLocalStorageContextProvider<T extends object>
	implements ContextInfoProvider<T>
{
	static currentContext() {
		return RequestContext.currentContext || rootContext;
	}

	currentContext() {
		return AsyncLocalStorageContextProvider.currentContext();
	}

	static subContext(subRoutine: string) {
		return this.currentContext().subContext(subRoutine);
	}

	subContext(subRoutine: string) {
		return AsyncLocalStorageContextProvider.subContext(subRoutine);
	}

	get correlationId() {
		return this.currentContext().correlationId;
	}

	get routine() {
		return this.currentContext().routine;
	}

	getContextInfo() {
		return this.currentContext().privateMeta[loggerContextSymbol];
	}
	setContextInfo(value: object) {
		this.currentContext().privateMeta[loggerContextSymbol] = value;
	}

	onContextEnd(callback: () => void): void {
		onContextEndList.push(callback);
	}

	contextualize<Callback extends Func>(callback: Callback) {
		const { correlationId, routine } = this;
		const info = this.getContextInfo();
		return ((...args: Parameters<Callback>) => {
			RequestContext.setContext(routine, correlationId);
			if (info) {
				this.setContextInfo(info);
			}
			return callback(...args);
		}) as Callback;
	}
}

export const asyncLocalStorageContextProvider =
	new AsyncLocalStorageContextProvider();

export const contextualize =
	asyncLocalStorageContextProvider.contextualize.bind(
		asyncLocalStorageContextProvider,
	);
