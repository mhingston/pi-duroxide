import { beforeEach, describe, expect, it } from "vitest";
import { WorkflowRegistry } from "../src/workflow-registry.js";

describe("WorkflowRegistry", () => {
	let registry: WorkflowRegistry;

	beforeEach(() => {
		registry = new WorkflowRegistry();
	});

	it("should register and retrieve workflows", () => {
		const gen = function* (_ctx: any, _input: any) {
			yield;
			return "ok";
		};
		registry.register("test-wf", gen, { description: "A test" });
		expect(registry.getWorkflowNames()).toEqual(["test-wf"]);
	});

	it("should unregister workflows", () => {
		registry.register("wf1", function* () {
			yield;
			return;
		});
		registry.register("wf2", function* () {
			yield;
			return;
		});
		registry.unregister("wf1");
		expect(registry.getWorkflowNames()).toEqual(["wf2"]);
	});

	it("should return empty list when no workflows registered", () => {
		expect(registry.getWorkflowNames()).toEqual([]);
	});

	it("should enqueue and flush pending registrations", () => {
		registry.enqueue("pending-wf", function* () {
			yield;
			return;
		});
		expect(registry.getWorkflowNames()).toEqual([]);
		const flushed = registry.flushPending();
		expect(flushed).toHaveLength(1);
		expect(flushed[0].name).toBe("pending-wf");
		expect(registry.flushPending()).toHaveLength(0);
	});
});
