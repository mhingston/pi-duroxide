import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerPiClientActivities } from "../src/pi-client.js";
import { WorkflowRuntime } from "../src/workflow-runtime.js";

describe("PiClient bindings E2E", () => {
	it("should route tool calls through ctx.pi.tool()", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-tool-e2e-"));
		const tmpDb = join(tmpDir, "test.db");

		const wfGen = function* (ctx: any, _input: any): Generator<any, any, any> {
			const result = yield ctx.pi.tool("my-tool", { arg1: "hello" });
			return result;
		};

		const bindings = {
			llm: null,
			tool: async (name: string, args: unknown) => {
				return { toolName: name, args, result: "tool-result-data" };
			},
			skill: null,
			sendMessage: null,
			prompt: null,
		};

		const runtime = new WorkflowRuntime();
		await runtime.start({
			dbPath: tmpDb,
			workflows: [
				{
					name: "tool-wf",
					generator: wfGen as any,
					sourceInfo: { source: "test" },
				},
			],
			onActivity: () => {},
			registerActivities: (rt) => {
				registerPiClientActivities(rt, bindings);
			},
		});

		const client = runtime.getClient()!;
		await client.startOrchestration("tool-1", "tool-wf", {});
		const result = await client.waitForOrchestration("tool-1", 10000);
		expect(result.status).toBe("Completed");
		expect(result.output).toEqual({
			toolName: "my-tool",
			args: { arg1: "hello" },
			result: "tool-result-data",
		});

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should route LLM calls through ctx.pi.llm()", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-llm-e2e-"));
		const tmpDb = join(tmpDir, "test.db");

		const wfGen = function* (ctx: any, _input: any): Generator<any, any, any> {
			const result = yield ctx.pi.llm([{ role: "user", content: "hello" }]);
			return result;
		};

		const bindings = {
			llm: async (_messages: unknown[], _options?: { model?: string }) => {
				return { role: "assistant", content: "LLM response", stopReason: "stop" };
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
					generator: wfGen as any,
					sourceInfo: { source: "test" },
				},
			],
			onActivity: () => {},
			registerActivities: (rt) => {
				registerPiClientActivities(rt, bindings);
			},
		});

		const client = runtime.getClient()!;
		await client.startOrchestration("llm-1", "llm-wf", {});
		const result = await client.waitForOrchestration("llm-1", 10000);
		expect(result.status).toBe("Completed");
		const out = result.output as unknown as { content: string };
		expect(out.content).toContain("LLM response");

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should route skill calls through ctx.pi.skill()", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-skill-e2e-"));
		const tmpDb = join(tmpDir, "test.db");

		const wfGen = function* (ctx: any, _input: any): Generator<any, any, any> {
			const result = yield ctx.pi.skill("test-skill", "use this skill");
			return result;
		};

		const bindings = {
			llm: null,
			tool: null,
			skill: async (_name: string, _input: string) => "mocked skill output",
			sendMessage: null,
			prompt: null,
		};

		const runtime = new WorkflowRuntime();
		await runtime.start({
			dbPath: tmpDb,
			workflows: [
				{
					name: "skill-wf",
					generator: wfGen as any,
					sourceInfo: { source: "test" },
				},
			],
			onActivity: () => {},
			registerActivities: (rt) => {
				registerPiClientActivities(rt, bindings);
			},
		});

		const client = runtime.getClient()!;
		await client.startOrchestration("skill-1", "skill-wf", {});
		const result = await client.waitForOrchestration("skill-1", 10000);
		expect(result.status).toBe("Completed");
		expect(result.output).toBe("mocked skill output");

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should route prompt calls through ctx.pi.prompt()", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-prompt-e2e-"));
		const tmpDb = join(tmpDir, "test.db");

		const wfGen = function* (ctx: any, _input: any): Generator<any, any, any> {
			const result = yield ctx.pi.prompt("What is pi?");
			return result;
		};

		const bindings = {
			llm: null,
			tool: null,
			skill: null,
			sendMessage: null,
			prompt: async (_prompt: string, _options?: { model?: string }) => "pi is a tool",
		};

		const runtime = new WorkflowRuntime();
		await runtime.start({
			dbPath: tmpDb,
			workflows: [
				{
					name: "prompt-wf",
					generator: wfGen as any,
					sourceInfo: { source: "test" },
				},
			],
			onActivity: () => {},
			registerActivities: (rt) => {
				registerPiClientActivities(rt, bindings);
			},
		});

		const client = runtime.getClient()!;
		await client.startOrchestration("prompt-1", "prompt-wf", {});
		const result = await client.waitForOrchestration("prompt-1", 10000);
		expect(result.status).toBe("Completed");
		expect(result.output).toBe("pi is a tool");

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});
});
