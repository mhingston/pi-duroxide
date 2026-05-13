import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, Runtime, SqliteProvider } from "duroxide";
import { describe, expect, it } from "vitest";

describe("Simple workflow", () => {
	it("should complete a workflow with one activity", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-simple-"));
		const dbPath = join(tmpDir, "test.db");
		const provider = await SqliteProvider.open(`sqlite:${dbPath}`);
		const runtime = new Runtime(provider);
		const client = new Client(provider);

		runtime.registerActivity("echo", async (_ctx: any, input: any) => ({ echoed: input }));
		runtime.registerOrchestration("echo-wf", function* (ctx: any, input: any) {
			const result = yield ctx.scheduleActivity("echo", input);
			return result;
		});

		await runtime.start();

		await client.startOrchestration("simple-1", "echo-wf", {
			message: "hello",
		});
		const result = await client.waitForOrchestration("simple-1");
		expect(result.output).toEqual({ echoed: { message: "hello" } });

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should handle multiple sequential activities", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-seq-"));
		const provider = await SqliteProvider.open(`sqlite:${join(tmpDir, "test.db")}`);
		const runtime = new Runtime(provider);
		const client = new Client(provider);

		runtime.registerActivity("step1", async (_ctx: any, input: any) => ({ step: 1, value: input.x + 1 }));
		runtime.registerActivity("step2", async (_ctx: any, input: any) => ({ step: 2, value: input.value * 2 }));

		runtime.registerOrchestration("multi-step", function* (ctx: any, input: any) {
			const a = yield ctx.scheduleActivity("step1", input);
			const b = yield ctx.scheduleActivity("step2", a);
			return b;
		});

		await runtime.start();
		await client.startOrchestration("seq-1", "multi-step", { x: 5 });
		const result = await client.waitForOrchestration("seq-1");
		expect(result.output).toEqual({ step: 2, value: 12 });

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});
});
