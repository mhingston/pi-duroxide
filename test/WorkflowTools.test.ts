import { describe, expect, it } from "vitest";
import { createWorkflowTools } from "../src/workflow-tools.js";

describe("Workflow tools", () => {
	it("should create 5 tool definitions", () => {
		const runtime = { getClient: () => null } as any;
		const tools = createWorkflowTools(runtime);
		expect(tools).toHaveLength(5);
	});

	it("should have correct tool names", () => {
		const runtime = { getClient: () => null } as any;
		const tools = createWorkflowTools(runtime);
		const names = tools.map((t) => t.name);
		expect(names).toEqual([
			"start-workflow",
			"get-workflow",
			"list-workflows",
			"signal-workflow",
			"wait-for-workflow",
		]);
	});

	it("should have valid parameter schemas on all tools", () => {
		const runtime = { getClient: () => null } as any;
		const tools = createWorkflowTools(runtime);
		for (const tool of tools) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("should have prompt snippets on all tools", () => {
		const runtime = { getClient: () => null } as any;
		const tools = createWorkflowTools(runtime);
		for (const tool of tools) {
			expect(typeof tool.promptSnippet).toBe("string");
		}
	});
});
