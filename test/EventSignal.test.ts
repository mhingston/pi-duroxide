import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, Runtime, SqliteProvider } from "duroxide";
import { describe, expect, it } from "vitest";

describe("Event signal workflow", () => {
	it("should start an orchestration that waits for events", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-ev-"));
		const provider = await SqliteProvider.open(`sqlite:${join(tmpDir, "test.db")}`);
		const runtime = new Runtime(provider);
		const client = new Client(provider);

		runtime.registerOrchestration("signal-wf", function* (ctx: any, _input: any) {
			const event = yield ctx.waitForEvent("my-event");
			return { received: event };
		});

		await runtime.start();
		await client.startOrchestration("ev-1", "signal-wf", {});

		// Poll until the orchestration is running
		let info: any = null;
		for (let i = 0; i < 20; i++) {
			await new Promise((r) => setTimeout(r, 100));
			try {
				info = await client.getInstanceInfo("ev-1");
				if (info) break;
			} catch {}
		}
		expect(info).not.toBeNull();
		expect(info.status).toBe("Running");

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});
});
