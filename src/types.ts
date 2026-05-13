export type YieldItem = unknown;

export type GeneratorStep<T> = T;

export interface RetryPolicy {
	maxRetries: number;
	backoffCoefficient?: number;
	maxRetryIntervalMs?: number;
}

export interface WorkflowOptions {
	description?: string;
	retryPolicy?: RetryPolicy;
	timeoutMs?: number;
	continueAsNewThreshold?: number;
}

export interface PiClient {
	llm(messages: unknown[], options?: { model?: string; tools?: unknown[] }): GeneratorStep<unknown>;
	tool(name: string, args: unknown): GeneratorStep<unknown>;
	skill(name: string, input: string): GeneratorStep<string>;
	sendMessage(content: string): GeneratorStep<void>;
	prompt(prompt: string, options?: { model?: string }): GeneratorStep<string>;
}

export interface WorkflowContext {
	scheduleActivity(name: string, input: unknown): YieldItem;
	scheduleActivityWithRetry(name: string, input: unknown, policy: RetryPolicy): YieldItem;
	scheduleTimer(delayMs: number): YieldItem;
	waitForEvent(eventName: string): YieldItem;
	scheduleSubOrchestration(name: string, input: unknown): YieldItem;
	all<T>(tasks: YieldItem[]): GeneratorStep<T[]>;
	race<T>(...tasks: YieldItem[]): GeneratorStep<T>;
	utcNow(): GeneratorStep<number>;
	newGuid(): GeneratorStep<string>;
	continueAsNew(input: unknown): GeneratorStep<never>;

	setCustomStatus(status: unknown): void;
	kv: {
		get(key: string): unknown;
		set(key: string, value: unknown): void;
		clear(key: string): void;
	};
	traceInfo(msg: string): void;
	traceWarn(msg: string): void;
	traceError(msg: string): void;
	traceDebug(msg: string): void;

	pi: PiClient;
}

export type OrchestrationGenerator<In, Out> = (ctx: WorkflowContext, input: In) => Generator<YieldItem, Out, unknown>;

export interface RegisteredWorkflow {
	name: string;
	generator: OrchestrationGenerator<unknown, unknown>;
	options?: WorkflowOptions;
	sourceInfo: { source: string; baseDir?: string };
}

export interface WorkflowRuntimeState {
	ready: boolean;
	dbPath: string;
}

export interface PiClientBindings {
	llm: ((messages: unknown[], options?: { model?: string }) => Promise<unknown>) | null;
	tool: ((name: string, args: unknown) => Promise<unknown>) | null;
	skill: ((name: string, input: string) => Promise<string>) | null;
	sendMessage: ((content: string) => Promise<void>) | null;
	prompt: ((prompt: string, options?: { model?: string }) => Promise<string>) | null;
}
