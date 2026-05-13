import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, Runtime, SqliteProvider } from "duroxide";
import { describe, expect, it } from "vitest";
import { registerPiClientActivities } from "../src/pi-client.js";

describe("PiClient activities", () => {
	it("should register activities on runtime with lazy bindings", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-act-"));
		const provider = await SqliteProvider.open(`sqlite:${join(tmpDir, "test.db")}`);
		const runtime = new Runtime(provider);

		const bindings = {
			llm: async (_messages: unknown[], _opts?: any) => {
				return { role: "assistant", content: "mocked llm response" };
			},
			tool: async (name: string, _args: unknown) => {
				return { toolName: name, result: "mocked tool result" };
			},
			skill: async (name: string, _input: string) => `mocked skill: ${name}`,
			sendMessage: async (_content: string) => undefined,
			prompt: async (prompt: string, _opts?: any) => `mocked: ${prompt}`,
		};
		const client = new Client(provider);
		runtime.registerOrchestration("test-llm", function* (_ctx: any, input: any) {
			const result = yield _ctx.scheduleActivity("__pi_llm", {
				messages: [{ role: "user", content: input }],
			});
			return result;
		});

		registerPiClientActivities(runtime, bindings);
		await runtime.start();

		await client.startOrchestration("test-1", "test-llm", "hello");
		const result = await client.waitForOrchestration("test-1");
		const out = result.output as { role: string; content: string } | undefined;
		expect(out).toBeTruthy();
		expect(out!.role).toBe("assistant");
		expect(out!.content).toBe("mocked llm response");

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should fail activities with null bindings", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-act2-"));
		const provider = await SqliteProvider.open(`sqlite:${join(tmpDir, "test.db")}`);
		const runtime = new Runtime(provider);
		const client = new Client(provider);

		const bindings = {
			llm: null,
			tool: null,
			skill: null,
			sendMessage: null,
			prompt: null,
		};

		runtime.registerOrchestration("failing-wf", function* (_ctx: any, _input: any) {
			const result = yield _ctx.scheduleActivity("__pi_llm", {
				messages: [],
			});
			return result;
		});

		registerPiClientActivities(runtime, bindings);
		await runtime.start();

		await client.startOrchestration("fail-1", "failing-wf", {});
		const result = await client.waitForOrchestration("fail-1", 5000);
		expect(result.status).toBe("Failed");
		expect(result.error as string).toContain("PiClient not bound");

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});
});
