import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@mariozechner/pi-ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, getMessageText } from "../../coding-agent/test/suite/harness.js";
import workflowExtension, { getWorkflowRegistry } from "../src/index.js";

describe("Real pi bindings E2E", () => {
	let tmpDir: string;
	let harness: Awaited<ReturnType<typeof createHarness>>;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "wf-real-e2e-"));
	});

	afterEach(async () => {
		try {
			harness?.cleanup();
		} catch {}
		const registry = getWorkflowRegistry();
		if (registry?.getRuntime().isRunning()) {
			await registry.shutdown();
		}
		if (tmpDir) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("should call a real pi tool from a workflow via ctx.pi.tool()", async () => {
		const dbPath = join(tmpDir, "workflows.db");
		harness = await createHarness({
			extensionFactories: [workflowExtension],
			models: [{ id: "faux-model", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
		});
		const registry = getWorkflowRegistry()!;
		registry.setDbPath(dbPath);
		registry.register(
			"tool-test",
			function* (ctx: any, input: { command: string }): Generator<any, any, any> {
				const result = yield ctx.pi.tool("bash", { command: input.command });
				return result;
			},
		);
		await harness.session.bindExtensions({});
		harness.setResponses([
			fauxAssistantMessage(
				fauxToolCall("start-workflow", {
					name: "tool-test",
					input: { command: 'echo "hello from workflow"' },
				}),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("Start the tool test workflow");
		const toolResult = harness.session.messages.find(
			(m: any) => m.role === "toolResult" && m.toolName === "start-workflow",
		);
		expect(toolResult).toBeDefined();
		const result = JSON.parse(getMessageText(toolResult!));
		expect(result.instanceId).toBeDefined();
		const client = registry.getRuntime().getClient()!;
		const wfResult = await client.waitForOrchestration(result.instanceId, 15000);
		expect(wfResult.status).toBe("Completed");
		expect((wfResult.output as any).content).toBeDefined();
		await registry.shutdown();
	});

	it("should send a message from a workflow via ctx.pi.sendMessage()", async () => {
		const dbPath = join(tmpDir, "workflows.db");
		harness = await createHarness({
			extensionFactories: [workflowExtension],
			models: [{ id: "faux-model", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
		});
		const registry = getWorkflowRegistry()!;
		registry.setDbPath(dbPath);
		registry.register(
			"msg-test",
			function* (ctx: any, _input: unknown): Generator<any, any, any> {
				yield ctx.pi.sendMessage("Deploy completed successfully");
				return { status: "done" };
			},
		);
		await harness.session.bindExtensions({});
		harness.setResponses([
			fauxAssistantMessage(
				fauxToolCall("start-workflow", { name: "msg-test", input: {} }),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("Start the message test workflow");
		const toolResult = harness.session.messages.find(
			(m: any) => m.role === "toolResult" && m.toolName === "start-workflow",
		);
		expect(toolResult).toBeDefined();
		const result = JSON.parse(getMessageText(toolResult!));
		expect(result.instanceId).toBeDefined();
		const client = registry.getRuntime().getClient()!;
		const wfResult = await client.waitForOrchestration(result.instanceId, 15000);
		expect(wfResult.status).toBe("Completed");
		expect((wfResult.output as any).status).toBe("done");
		const customMsg = harness.session.messages.find(
			(m: any) => m.role === "custom" && m.customType === "workflow_message",
		);
		expect(customMsg).toBeDefined();
		await registry.shutdown();
	});

	it("should call the LLM from a workflow via ctx.pi.llm()", async () => {
		const dbPath = join(tmpDir, "workflows.db");
		harness = await createHarness({
			extensionFactories: [workflowExtension],
			models: [{ id: "faux-model", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
		});
		const registry = getWorkflowRegistry()!;
		registry.setDbPath(dbPath);
		registry.register(
			"llm-test",
			function* (ctx: any, _input: unknown): Generator<any, any, any> {
				const result = yield ctx.pi.llm([
					{ role: "user", content: [{ type: "text", text: "What is 2+2?" }], timestamp: Date.now() },
				]);
				return result;
			},
		);
		await harness.session.bindExtensions({});
		harness.setResponses([
			fauxAssistantMessage(
				fauxToolCall("start-workflow", { name: "llm-test", input: {} }),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("The answer is 4"),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("Start the LLM test workflow");
		const toolResult = harness.session.messages.find(
			(m: any) => m.role === "toolResult" && m.toolName === "start-workflow",
		);
		expect(toolResult).toBeDefined();
		const result = JSON.parse(getMessageText(toolResult!));
		expect(result.instanceId).toBeDefined();
		const client = registry.getRuntime().getClient()!;
		const wfResult = await client.waitForOrchestration(result.instanceId, 15000);
		expect(wfResult.status).toBe("Completed");
		const output = wfResult.output as any;
		expect(output).toBeDefined();
		expect(output.role).toBe("assistant");
		await registry.shutdown();
	});

	it("should call the LLM with a prompt via ctx.pi.prompt()", async () => {
		const dbPath = join(tmpDir, "workflows.db");
		harness = await createHarness({
			extensionFactories: [workflowExtension],
			models: [{ id: "faux-model", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
		});
		const registry = getWorkflowRegistry()!;
		registry.setDbPath(dbPath);
		registry.register(
			"prompt-test",
			function* (ctx: any, _input: unknown): Generator<any, any, any> {
				const result = yield ctx.pi.prompt("Explain quantum computing briefly");
				return result;
			},
		);
		await harness.session.bindExtensions({});
		harness.setResponses([
			fauxAssistantMessage(
				fauxToolCall("start-workflow", { name: "prompt-test", input: {} }),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("Quantum computing uses qubits."),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("Start the prompt test workflow");
		const toolResult = harness.session.messages.find(
			(m: any) => m.role === "toolResult" && m.toolName === "start-workflow",
		);
		expect(toolResult).toBeDefined();
		const result = JSON.parse(getMessageText(toolResult!));
		expect(result.instanceId).toBeDefined();
		const client = registry.getRuntime().getClient()!;
		const wfResult = await client.waitForOrchestration(result.instanceId, 15000);
		expect(wfResult.status).toBe("Completed");
		const output = wfResult.output as any;
		expect(typeof output).toBe("string");
		expect(output.length).toBeGreaterThan(0);
		await registry.shutdown();
	});

	it("should load a skill and call the LLM via ctx.pi.skill()", async () => {
		const dbPath = join(tmpDir, "workflows.db");
		harness = await createHarness({
			extensionFactories: [workflowExtension],
			models: [{ id: "faux-model", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
		});
		const registry = getWorkflowRegistry()!;
		registry.setDbPath(dbPath);
		const skillDir = join(harness.tempDir, ".pi", "skills", "test-skill");
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(
			join(skillDir, "test-skill.md"),
			"---\ndescription: Test skill\n---\nYou are a helpful test assistant. Respond concisely.",
		);
		registry.register(
			"skill-test",
			function* (ctx: any, _input: unknown): Generator<any, any, any> {
				const result = yield ctx.pi.skill("test-skill", "What is the meaning of life?");
				return result;
			},
		);
		await harness.session.bindExtensions({});
		harness.setResponses([
			fauxAssistantMessage(
				fauxToolCall("start-workflow", { name: "skill-test", input: {} }),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("42"),
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("Start the skill test workflow");
		const toolResult = harness.session.messages.find(
			(m: any) => m.role === "toolResult" && m.toolName === "start-workflow",
		);
		expect(toolResult).toBeDefined();
		const result = JSON.parse(getMessageText(toolResult!));
		expect(result.instanceId).toBeDefined();
		const client = registry.getRuntime().getClient()!;
		const wfResult = await client.waitForOrchestration(result.instanceId, 15000);
		expect(wfResult.status).toBe("Completed");
		const output = wfResult.output as any;
		expect(typeof output).toBe("string");
		expect(output.length).toBeGreaterThan(0);
		await registry.shutdown();
	});
});