import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkflowRuntime } from "../src/workflow-runtime.js";

describe("WorkflowRuntime", () => {
	let tmpDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "wf-test-"));
	});

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should start and shutdown", async () => {
		const runtime = new WorkflowRuntime();
		expect(runtime.isRunning()).toBe(false);
		await runtime.start({
			dbPath: join(tmpDir, "test.db"),
			workflows: [],
			onActivity: () => {},
		});
		expect(runtime.isRunning()).toBe(true);
		expect(runtime.getClient()).not.toBeNull();
		await runtime.shutdown();
		expect(runtime.isRunning()).toBe(false);
	});

	it("should be idempotent on start", async () => {
		const runtime = new WorkflowRuntime();
		await runtime.start({
			dbPath: join(tmpDir, "test2.db"),
			workflows: [],
			onActivity: () => {},
		});
		await runtime.start({
			dbPath: join(tmpDir, "test2.db"),
			workflows: [],
			onActivity: () => {},
		});
		expect(runtime.isRunning()).toBe(true);
		await runtime.shutdown();
	});

	it("should return null client before start", () => {
		const runtime = new WorkflowRuntime();
		expect(runtime.getClient()).toBeNull();
	});

	it("should be safe to shutdown when not running", async () => {
		const runtime = new WorkflowRuntime();
		await runtime.shutdown();
		expect(runtime.isRunning()).toBe(false);
	});
});
