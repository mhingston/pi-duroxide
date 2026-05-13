import type { Runtime } from "duroxide";
import type { PiClientBindings } from "./types.js";

export type { PiClientBindings };

export function registerPiClientActivities(runtime: Runtime, bindings: PiClientBindings): void {
	runtime.registerActivity(
		"__pi_llm",
		async (_ctx: any, input: { messages: unknown[]; options?: { model?: string } }) => {
			if (!bindings.llm) throw new Error("PiClient not bound: __pi_llm not available until session starts");
			return bindings.llm(input.messages, input.options);
		},
	);

	runtime.registerActivity("__pi_tool", async (_ctx: any, input: { name: string; args: unknown }) => {
		if (!bindings.tool) throw new Error("PiClient not bound: __pi_tool not available until session starts");
		return bindings.tool(input.name, input.args);
	});

	runtime.registerActivity("__pi_skill", async (_ctx: any, input: { name: string; input: string }) => {
		if (!bindings.skill) throw new Error("PiClient not bound: __pi_skill not available until session starts");
		return bindings.skill(input.name, input.input);
	});

	runtime.registerActivity("__pi_sendMessage", async (_ctx: any, input: { content: string }) => {
		if (!bindings.sendMessage)
			throw new Error("PiClient not bound: __pi_sendMessage not available until session starts");
		return bindings.sendMessage(input.content);
	});

	runtime.registerActivity(
		"__pi_prompt",
		async (_ctx: any, input: { prompt: string; options?: { model?: string } }) => {
			if (!bindings.prompt) throw new Error("PiClient not bound: __pi_prompt not available until session starts");
			return bindings.prompt(input.prompt, input.options);
		},
	);
}
