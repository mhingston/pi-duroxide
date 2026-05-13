import { Client, Runtime, SqliteProvider } from "duroxide";
import { createPiClient } from "./pi-client-impl.js";
import type { RegisteredWorkflow } from "./types.js";

export interface WorkflowRuntimeOptions {
	dbPath: string;
	workflows: RegisteredWorkflow[];
	onActivity: (name: string) => void;
	registerActivities?: (runtime: Runtime) => void;
}

export class WorkflowRuntime {
	private provider: SqliteProvider | null = null;
	private client: Client | null = null;
	private runtime: Runtime | null = null;
	private started = false;

	getClient(): Client | null {
		return this.client;
	}

	getDuroxideRuntime(): Runtime | null {
		return this.runtime;
	}

	isRunning(): boolean {
		return this.started;
	}

	async start(options: WorkflowRuntimeOptions): Promise<void> {
		if (this.started) return;

		try {
			this.provider = await SqliteProvider.open(`sqlite:${options.dbPath}`);
			this.client = new Client(this.provider);
			this.runtime = new Runtime(this.provider);

			if (options.registerActivities) {
				options.registerActivities(this.runtime);
			}

			for (const wf of options.workflows) {
				const original = wf.generator as (ctx: any, input: any) => Generator;
				const wrapped = (ctx: any, input: any) => {
					ctx.pi = createPiClient((name: string, input: unknown) => ctx.scheduleActivity(name, input));
					return original(ctx, input);
				};
				this.runtime.registerOrchestration(wf.name, wrapped);
			}

			await this.runtime.start();
			this.started = true;
		} catch (err) {
			this.started = false;
			throw err;
		}
	}

	async shutdown(): Promise<void> {
		if (!this.started) return;
		this.started = false;
		try {
			await this.runtime?.shutdown();
		} finally {
			this.runtime = null;
			this.client = null;
			this.provider = null;
		}
	}
}
