import { v4 } from 'uuid';
import { ContextInfoProvider } from 'winston-context-logger';
import * as nodeCleanup from 'node-cleanup';
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

	static async setContext(
		routine: string,
		correlationId: string | undefined,
		initialize?: () => Promise<void> | void,
	) {
		this.storage.enterWith(new RequestContext(correlationId || v4(), routine));
		await initialize?.();
	}

	subContext(subRoutine: string, initialize?: () => Promise<void> | void) {
		return RequestContext.setContext(
			`${this.routine}.${subRoutine}`,
			this.correlationId,
			initialize,
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

export class AsyncLocalStorageContextProvider<T extends object>
	implements ContextInfoProvider<T>
{
	static currentContext() {
		return RequestContext.currentContext || rootContext;
	}

	currentContext() {
		return AsyncLocalStorageContextProvider.currentContext();
	}

	static subContext(
		subRoutine: string,
		initialize?: () => Promise<void> | void,
	) {
		return this.currentContext().subContext(subRoutine, initialize);
	}

	subContext<R>(
		subRoutine: string,
		callback: () => Promise<R> | R,
		initialize?: () => Promise<void> | void,
	) {
		return AsyncLocalStorageContextProvider.subContext(subRoutine, initialize);
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
}

nodeCleanup(RequestContext.flush.bind(RequestContext));

export const asyncLocalStorageContextProvider =
	new AsyncLocalStorageContextProvider();
