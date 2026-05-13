import { randomUUID } from "node:crypto";
import type { RegisteredCommand, SourceInfo } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";
import type { WorkflowRegistry } from "./workflow-registry.js";

function extSourceInfo(): SourceInfo {
	return { path: "", source: "extension", scope: "temporary", origin: "top-level", baseDir: undefined };
}

export function createWorkflowCommands(registry: WorkflowRegistry): RegisteredCommand[] {
	const listCommand: RegisteredCommand = {
		name: "workflows",
		sourceInfo: extSourceInfo(),
		description:
			"List and manage running workflow instances. Shows registered workflows and all orchestration instances with status.",
		handler: async (_args, ctx) => {
			const names = registry.getWorkflowNames();
			const runtime = registry.getRuntime();
			const client = runtime.getClient();
			let text = "### Registered Workflows\n";
			if (names.length === 0) {
				text += "No workflows registered.\n";
			} else {
				for (const name of names) {
					text += `- \`${name}\`\n`;
				}
			}

			if (client) {
				try {
					const instances: any[] = await client.listAllInstances();
					text += "\n### Orchestration Instances\n";
					if (instances.length === 0) {
						text += "No running or completed instances.\n";
					} else {
						for (const inst of instances) {
							text += `- \`${inst.instanceId}\`: ${inst.status}`;
							if (inst.customStatus) text += ` (${inst.customStatus})`;
							text += "\n";
						}
					}
				} catch {
					text += "\n_(could not query instances)_\n";
				}
			}

			text += "\n### Workflow Runtime\n";
			text += runtime.isRunning() ? "Runtime: **running**\n" : "Runtime: **stopped**\n";

			ctx.ui.notify(text, "info");
		},
	};

	const startCommand: RegisteredCommand = {
		name: "workflow:start",
		sourceInfo: extSourceInfo(),
		description: "Start a workflow by name with optional JSON input. Usage: /workflow:start <name> [input JSON]",
		getArgumentCompletions: (argumentPrefix: string) => {
			const names = registry.getWorkflowNames();
			const items: AutocompleteItem[] = (
				argumentPrefix ? names.filter((n) => n.startsWith(argumentPrefix)) : names
			).map((n) => ({
				value: n,
				label: n,
				description: `Start workflow '${n}'`,
			}));
			return items;
		},
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/);
			if (parts.length === 0) {
				ctx.ui.notify("Usage: /workflow:start <name> [input JSON]", "error");
				return;
			}
			const [name, ...inputParts] = parts;
			const input = inputParts.length > 0 ? JSON.parse(inputParts.join(" ")) : {};

			const client = registry.getRuntime().getClient();
			if (!client) {
				ctx.ui.notify("Workflow runtime not started", "error");
				return;
			}

			const instanceId = randomUUID();
			await client.startOrchestration(instanceId, name, input);
			ctx.ui.notify(`Started workflow '${name}' (${instanceId})`, "info");
		},
	};

	return [listCommand, startCommand];
}
