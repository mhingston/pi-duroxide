import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OrchestrationGenerator, WorkflowContext, WorkflowOptions, YieldItem } from "./types.js";
import { createWorkflowCommands } from "./workflow-commands.js";
import { WorkflowRegistry } from "./workflow-registry.js";
import { createWorkflowTools } from "./workflow-tools.js";

export { registerPiClientActivities } from "./pi-client.js";
export { createPiClient } from "./pi-client-impl.js";
export type {
	GeneratorStep,
	OrchestrationGenerator,
	PiClient,
	PiClientBindings,
	RegisteredWorkflow,
	RetryPolicy,
	WorkflowContext,
	WorkflowOptions,
	WorkflowRuntimeState,
	YieldItem,
} from "./types.js";
export { createWorkflowCommands } from "./workflow-commands.js";
export { WorkflowRegistry } from "./workflow-registry.js";
export { WorkflowRuntime } from "./workflow-runtime.js";
export { createWorkflowTools } from "./workflow-tools.js";

let registry: WorkflowRegistry | undefined;

export function registerWorkflow<In = unknown, Out = unknown>(
	name: string,
	generator: (ctx: WorkflowContext, input: In) => Generator<YieldItem, Out, unknown>,
	options?: WorkflowOptions,
): void {
	if (!registry) {
		console.warn("[pi-duroxide] Workflow extension not loaded — call failed for:", name);
		return;
	}
	registry.enqueue(name, generator as OrchestrationGenerator<unknown, unknown>, options);
}

// Lazy bindings wired on session_start
const bindings: {
	llm: ((messages: unknown[], options?: { model?: string }) => Promise<unknown>) | null;
	tool: ((name: string, args: unknown) => Promise<unknown>) | null;
	skill: ((name: string, input: string) => Promise<string>) | null;
	sendMessage: ((content: string) => Promise<void>) | null;
	prompt: ((prompt: string, options?: { model?: string }) => Promise<string>) | null;
} = {
	llm: null,
	tool: null,
	skill: null,
	sendMessage: null,
	prompt: null,
};

function extractText(msg: AssistantMessage): string {
	const parts: string[] = [];
	for (const block of msg.content) {
		if (block.type === "text") {
			parts.push(block.text);
		}
	}
	return parts.join("\n");
}

function loadSkill(name: string, cwd: string): string | undefined {
	const searchPaths = [
		join(homedir(), ".pi", "agent", "skills", name, `${name}.md`),
		join(cwd, ".pi", "skills", name, `${name}.md`),
	];
	for (const filePath of searchPaths) {
		if (existsSync(filePath)) {
			const raw = readFileSync(filePath, "utf-8");
			return stripFrontmatter(raw);
		}
	}
	return undefined;
}

function stripFrontmatter(content: string): string {
	const lines = content.split("\n");
	if (lines[0]?.trim() !== "---") return content;
	let endIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			endIndex = i;
			break;
		}
	}
	return endIndex === -1
		? content
		: lines
				.slice(endIndex + 1)
				.join("\n")
				.trim();
}

export default async function workflowExtension(pi: ExtensionAPI) {
	registry = new WorkflowRegistry();

	let duroxideAvailable = true;
	try {
		await import("duroxide");
	} catch {
		duroxideAvailable = false;
		console.warn("[pi-duroxide] duroxide not available — workflow extension disabled");
	}

	if (!duroxideAvailable) return;

	// Register tools
	const runtime = registry.getRuntime();
	const tools = createWorkflowTools(runtime);
	for (const tool of tools) {
		pi.registerTool(tool);
	}

	// Register slash commands
	const commands = createWorkflowCommands(registry);
	for (const cmd of commands) {
		pi.registerCommand(cmd.name, cmd);
	}

	pi.on("session_start", async (_event, _ctx) => {
		if (registry && !registry.getRuntime().isRunning()) {
			try {
				// Drain pending registrations from extension loading
				for (const pending of registry.flushPending()) {
					registry.register(pending.name, pending.generator, pending.options);
				}

				// Wire real pi services into the lazy bindings
				bindings.sendMessage = async (content) => {
					pi.sendMessage({
						customType: "workflow_message",
						content: [{ type: "text", text: content }],
						display: true,
						details: undefined,
					});
				};

				bindings.tool = async (name, args) => {
					pi.sendMessage({
						customType: "workflow_tool_call",
						content: [{ type: "text", text: JSON.stringify({ tool: name, args }) }],
						display: true,
						details: undefined,
					});
					return _ctx.executeTool(name, args);
				};

				bindings.llm = async (messages) => {
					return _ctx.streamLlm(messages as AgentMessage[]);
				};

				bindings.skill = async (name, input) => {
					const content = loadSkill(name, _ctx.cwd);
					if (!content) throw new Error(`Skill "${name}" not found`);
					const prompt = `<skill name="${name}">\n${content}\n</skill>\n\n${input}`;
					const result = await _ctx.streamLlm(
						[{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
						{ systemPrompt: "" },
					);
					return extractText(result);
				};

				bindings.prompt = async (text) => {
					const result = await _ctx.streamLlm(
						[{ role: "user", content: [{ type: "text", text }], timestamp: Date.now() }],
						{ systemPrompt: "" },
					);
					return extractText(result);
				};

				await registry.start(bindings);
			} catch (err) {
				console.warn("[pi-duroxide] Failed to start duroxide runtime:", err);
			}
		}
	});

	pi.on("session_shutdown", async () => {
		await registry?.shutdown();
	});
}

export function getWorkflowRegistry(): WorkflowRegistry | undefined {
	return registry;
}
