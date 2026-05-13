import { randomUUID } from "node:crypto";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { WorkflowRuntime } from "./workflow-runtime.js";

function getClient(runtime: WorkflowRuntime) {
	const client = runtime.getClient();
	if (!client) throw new Error("Workflow runtime not started");
	return client;
}

export function createWorkflowTools(runtime: WorkflowRuntime): ToolDefinition[] {
	const startWorkflow: ToolDefinition = {
		name: "start-workflow",
		label: "Start Workflow",
		description: "Start a durable workflow by name. Returns an instanceId for tracking.",
		parameters: Type.Object({
			name: Type.String({ description: "Registered workflow name" }),
			input: Type.Any({ description: "JSON input to the workflow" }),
			id: Type.Optional(Type.String({ description: "Optional explicit instance ID" })),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
			const p = params as { id?: string; name: string; input: unknown };
			const c = getClient(runtime);
			const instanceId = p.id ?? randomUUID();
			await c.startOrchestration(instanceId, p.name, p.input);
			return { content: [{ type: "text", text: JSON.stringify({ instanceId }) }], details: undefined };
		},
		promptSnippet:
			"Start a durable workflow by name. Returns an instanceId for tracking. Use get-workflow to check status.",
	};

	const getWorkflow: ToolDefinition = {
		name: "get-workflow",
		label: "Get Workflow Status",
		description: "Get the status, output, and custom status of a workflow instance.",
		parameters: Type.Object({
			instanceId: Type.String({
				description: "Workflow instance ID",
			}),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
			const p = params as { instanceId: string };
			const c = getClient(runtime);
			const info = await c.getInstanceInfo(p.instanceId);
			return {
				content: [{ type: "text", text: JSON.stringify(info ?? { status: "not_found" }) }],
				details: undefined,
			};
		},
		promptSnippet: "Get the current status of a workflow instance by its instanceId.",
	};

	const listWorkflows: ToolDefinition = {
		name: "list-workflows",
		label: "List Workflows",
		description: "List all workflow instances, optionally filtered by name and/or status.",
		parameters: Type.Object({
			name: Type.Optional(
				Type.String({
					description: "Filter by workflow name",
				}),
			),
			status: Type.Optional(
				Type.String({
					description: "Filter by status (Running, Completed, Failed, Terminated, Pending)",
				}),
			),
		}),
		execute: async (_toolCallId, _params, _signal, _onUpdate, _ctx) => {
			const c = getClient(runtime);
			const instances = await c.listAllInstances();
			return { content: [{ type: "text", text: JSON.stringify(instances) }], details: undefined };
		},
		promptSnippet: "List all workflow instances with optional filtering by name or status.",
	};

	const signalWorkflow: ToolDefinition = {
		name: "signal-workflow",
		label: "Signal Workflow",
		description: "Send an external event to a workflow that is waiting for it via ctx.waitForEvent().",
		parameters: Type.Object({
			instanceId: Type.String({
				description: "Workflow instance ID",
			}),
			eventName: Type.String({
				description: "Event name (matching ctx.waitForEvent name)",
			}),
			data: Type.Any({
				description: "JSON data to send with the event",
			}),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
			const p = params as { instanceId: string; eventName: string; data: unknown };
			const c = getClient(runtime);
			await c.enqueueEvent(p.instanceId, p.eventName, JSON.stringify(p.data));
			return { content: [{ type: "text", text: JSON.stringify({ signalled: true }) }], details: undefined };
		},
		promptSnippet: "Send an external event to a waiting workflow. The workflow must be paused on ctx.waitForEvent().",
	};

	const waitForWorkflow: ToolDefinition = {
		name: "wait-for-workflow",
		label: "Wait For Workflow",
		description:
			"Wait for a workflow to complete and return its output. Blocks until the workflow finishes or the timeout expires.",
		parameters: Type.Object({
			instanceId: Type.String({
				description: "Workflow instance ID",
			}),
			timeoutMs: Type.Optional(
				Type.Number({
					description: "Maximum wait time in ms (default: 60000)",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
			const p = params as { instanceId: string; timeoutMs?: number };
			const c = getClient(runtime);
			const timeout = p.timeoutMs ?? 60000;
			const result = await c.waitForOrchestration(p.instanceId, timeout);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: undefined };
		},
		promptSnippet: "Block until a workflow completes. Returns the workflow output or timeout error.",
	};

	return [startWorkflow, getWorkflow, listWorkflows, signalWorkflow, waitForWorkflow];
}
