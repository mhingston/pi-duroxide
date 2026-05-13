import { describe, expect, it } from "vitest";
import { createWorkflowCommands } from "../src/workflow-commands.js";
import { WorkflowRegistry } from "../src/workflow-registry.js";

describe("Workflow commands", () => {
	it("should create a list of commands from registry", () => {
		const registry = new WorkflowRegistry();
		registry.register("test-wf", function* () {
			yield;
			return;
		});
		const commands = createWorkflowCommands(registry);
		expect(commands).toHaveLength(2);
	});

	it("should have correct command names", () => {
		const registry = new WorkflowRegistry();
		const commands = createWorkflowCommands(registry);
		const names = commands.map((c) => c.name);
		expect(names).toEqual(["workflows", "workflow:start"]);
	});

	it("should have command handler functions", () => {
		const registry = new WorkflowRegistry();
		const commands = createWorkflowCommands(registry);
		for (const cmd of commands) {
			expect(typeof cmd.handler).toBe("function");
		}
	});

	it("should provide argument completions for workflow:start", () => {
		const registry = new WorkflowRegistry();
		registry.register("deploy", function* () {
			yield;
			return;
		});
		registry.register("test", function* () {
			yield;
			return;
		});
		const commands = createWorkflowCommands(registry);
		const startCmd = commands.find((c) => c.name === "workflow:start")!;
		expect(startCmd.getArgumentCompletions).toBeDefined();
		const completions = startCmd.getArgumentCompletions!("");
		expect(completions).toHaveLength(2);
		expect((completions as { label: string }[]).map((c) => c.label)).toContain("deploy");
	});
});
