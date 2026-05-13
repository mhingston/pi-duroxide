import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerPiClientActivities } from "../src/pi-client.js";
import { WorkflowRuntime } from "../src/workflow-runtime.js";

describe("LLM activity via workflow", () => {
	it("should route an LLM call through PiClient bindings as a duroxide activity", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-llm-"));
		const tmpDb = join(tmpDir, "test.db");

		const orchGenerator = function* (ctx: any, input: any): Generator<any, any, any> {
			const result = yield ctx.scheduleActivity("__pi_llm", {
				messages: [{ role: "user", content: input }],
			});
			return result;
		};

		const bindings = {
			llm: async (_messages: unknown[], _options?: { model?: string }) => {
				return { role: "assistant", content: "Hello from LLM activity" };
			},
			tool: null,
			skill: null,
			sendMessage: null,
			prompt: null,
		};

		const runtime = new WorkflowRuntime();
		await runtime.start({
			dbPath: tmpDb,
			workflows: [
				{
					name: "llm-wf",
					generator: orchGenerator as any,
					sourceInfo: { source: "test" },
				},
			],
			onActivity: () => {},
			registerActivities: (rt) => {
				registerPiClientActivities(rt, bindings);
			},
		});

		const client = runtime.getClient()!;
		await client.startOrchestration("llm-1", "llm-wf", "test prompt");
		const result = await client.waitForOrchestration("llm-1");
		const out = result.output as { role: string; content: string } | undefined;
		expect(out).toBeTruthy();
		expect(out!.content).toContain("Hello from LLM activity");

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});
});
