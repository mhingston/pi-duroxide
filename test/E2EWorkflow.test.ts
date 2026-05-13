import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, getMessageText } from "../../coding-agent/test/suite/harness.js";
import workflowExtension, { getWorkflowRegistry } from "../src/index.js";

describe("E2E durable workflow", () => {
	const tmpDir = mkdtempSync(join(tmpdir(), "wf-e2e-"));
	const dbPath = join(tmpDir, "e2e.db");

	afterEach(async () => {
		const registry = getWorkflowRegistry();
		if (registry?.getRuntime().isRunning()) {
			await registry.shutdown();
		}
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should execute a workflow triggered by LLM tool call", async () => {
		const harness = await createHarness({
			extensionFactories: [workflowExtension],
			models: [{ id: "faux-model", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
		});

		// Register a workflow
		const registry = getWorkflowRegistry()!;
		const echoGen = function* (ctx: any, input: any): Generator<any, any, any> {
			const result = yield ctx.scheduleActivity("echo", input);
			return result;
		};
		registry.register("echo-wf", echoGen);

		// Manually start the runtime (session_start doesn't fire in test harness)
		await registry.getRuntime().start({
			dbPath,
			workflows: [
				{
					name: "echo-wf",
					generator: echoGen as any,
					sourceInfo: { source: "test" },
				},
			],
			registerActivities: (r) => {
				r.registerActivity("echo", async (_ctx: any, input: any) => ({ echoed: input }));
			},
			onActivity: () => {},
		});
		expect(registry.getRuntime().isRunning()).toBe(true);

		// LLM calls start-workflow, then responds with completion
		harness.setResponses([
			fauxAssistantMessage(
				fauxToolCall("start-workflow", {
					name: "echo-wf",
					input: { message: "hello" },
				}),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("workflow started"),
		]);

		await harness.session.prompt("Start the echo workflow");

		// Extract instanceId from the tool result
		const toolResult = harness.session.messages.find(
			(m: any) => m.role === "toolResult" && m.toolName === "start-workflow",
		);
		expect(toolResult).toBeDefined();
		const text = getMessageText(toolResult!);
		const result = JSON.parse(text);
		expect(result.instanceId).toBeDefined();
		const instanceId = result.instanceId as string;

		// Wait for the workflow to complete
		const client = registry.getRuntime().getClient()!;
		const wfResult = await client.waitForOrchestration(instanceId, 10000);
		expect(wfResult.status).toBe("Completed");
		expect(wfResult.output).toEqual({ echoed: { message: "hello" } });
	});
});
