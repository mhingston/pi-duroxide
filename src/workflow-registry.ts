import { join } from "node:path";
import type { PiClientBindings } from "./pi-client.js";
import { registerPiClientActivities } from "./pi-client.js";
import type { OrchestrationGenerator, RegisteredWorkflow, WorkflowOptions } from "./types.js";
import { WorkflowRuntime } from "./workflow-runtime.js";

function getAgentDir(): string {
	const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
	return join(home, ".pi", "agent");
}

export class WorkflowRegistry {
	private workflows: Map<string, RegisteredWorkflow> = new Map();
	private runtime: WorkflowRuntime = new WorkflowRuntime();
	private pending: Array<{
		name: string;
		generator: OrchestrationGenerator<unknown, unknown>;
		options?: WorkflowOptions;
	}> = [];
	private dbPathOverride: string | undefined;

	register(
		name: string,
		generator: OrchestrationGenerator<unknown, unknown>,
		options?: WorkflowOptions,
		extensionPath?: string,
	): void {
		this.workflows.set(name, {
			name,
			generator,
			options,
			sourceInfo: { source: "extension", baseDir: extensionPath },
		});
	}

	enqueue(name: string, generator: OrchestrationGenerator<unknown, unknown>, options?: WorkflowOptions): void {
		this.pending.push({ name, generator, options });
	}

	flushPending(): Array<{
		name: string;
		generator: OrchestrationGenerator<unknown, unknown>;
		options?: WorkflowOptions;
	}> {
		const items = [...this.pending];
		this.pending = [];
		return items;
	}

	unregister(name: string): void {
		this.workflows.delete(name);
	}

	getWorkflowNames(): string[] {
		return Array.from(this.workflows.keys());
	}

	getRuntime(): WorkflowRuntime {
		return this.runtime;
	}

	setDbPath(dbPath: string): void {
		this.dbPathOverride = dbPath;
	}

	async start(bindings: PiClientBindings): Promise<void> {
		const dbPath = this.dbPathOverride ?? join(getAgentDir(), "workflows.db");
		await this.runtime.start({
			dbPath,
			workflows: Array.from(this.workflows.values()),
			onActivity: () => {},
			registerActivities: (rt) => {
				registerPiClientActivities(rt, bindings);
			},
		});
	}

	async shutdown(): Promise<void> {
		await this.runtime.shutdown();
	}
}
