import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, Runtime, SqliteProvider } from "duroxide";
import { describe, expect, it } from "vitest";

describe("Parallel workflow (fan-out)", () => {
	it("should execute activities in parallel via ctx.all()", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "wf-par-"));
		const provider = await SqliteProvider.open(`sqlite:${join(tmpDir, "test.db")}`);
		const runtime = new Runtime(provider);
		const client = new Client(provider);

		runtime.registerActivity("slow-task", async (_ctx: any, input: any) => {
			await new Promise((r) => setTimeout(r, input.delay ?? 10));
			return { name: input.name };
		});

		runtime.registerOrchestration("parallel-wf", function* (ctx: any, _input: any) {
			const results = yield ctx.all([
				ctx.scheduleActivity("slow-task", {
					name: "A",
					delay: 30,
				}),
				ctx.scheduleActivity("slow-task", {
					name: "B",
					delay: 10,
				}),
				ctx.scheduleActivity("slow-task", {
					name: "C",
					delay: 20,
				}),
			]);
			return results;
		});

		await runtime.start();

		await client.startOrchestration("par-1", "parallel-wf", {});
		const result = await client.waitForOrchestration("par-1");
		const out = result.output as { ok: { name: string } }[] | undefined;
		expect(out).toHaveLength(3);
		expect(out![0].ok.name).toBe("A");
		expect(out![1].ok.name).toBe("B");
		expect(out![2].ok.name).toBe("C");

		await runtime.shutdown();
		rmSync(tmpDir, { recursive: true, force: true });
	});
});
