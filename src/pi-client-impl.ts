import type { PiClient } from "./types.js";

function stripTimestamps(messages: unknown[]): unknown[] {
	return JSON.parse(JSON.stringify(messages, (_key, value) => {
		if (typeof value === "object" && value !== null && "timestamp" in value) {
			const { timestamp: _, ...rest } = value as Record<string, unknown>;
			return rest;
		}
		return value;
	}));
}

export function createPiClient(scheduleActivity: (name: string, input: unknown) => unknown): PiClient {
	return {
		tool: (name, args) => scheduleActivity("__pi_tool", { name, args }) as unknown,
		llm: (messages, options) => scheduleActivity("__pi_llm", { messages: stripTimestamps(messages), options }) as unknown,
		skill: (name, input) => scheduleActivity("__pi_skill", { name, input }) as string,
		sendMessage: (content) => scheduleActivity("__pi_sendMessage", { content }) as undefined,
		prompt: (prompt, options) => scheduleActivity("__pi_prompt", { prompt, options }) as string,
	};
}
