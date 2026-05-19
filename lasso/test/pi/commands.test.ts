import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  randomUUID: () => "instance-123",
}));

vi.mock("../../src/reference/pr-review-merge.js", () => ({
  buildPrReviewMergeHarnessSpec: vi.fn(),
}));

vi.mock("../../src/compiler/compile.js", () => ({
  compileHarnessSpec: vi.fn(),
}));

import { compileHarnessSpec } from "../../src/compiler/compile.js";
import { createLassoCommands, clearCompiledHarnesses } from "../../src/pi/commands.js";
import { buildPrReviewMergeHarnessSpec } from "../../src/reference/pr-review-merge.js";

describe("Lasso pi commands", () => {
  const bundle = {
    repoPath: "/tmp/repo",
    sourceBranch: "feature/pr-change",
    targetBranch: "main",
    reviewInstructions: "Review carefully.",
    verificationCommands: ['node -e "process.exit(0)"'],
  };
  const spec = { name: "pr-review-merge", graph: { entryNodeId: "start", nodes: [], edges: [] } };
  const compiled = {
    name: "pr-review-merge",
    spec,
    cir: { name: "pr-review-merge", entryNodeId: "start", nodes: [], transitions: [] },
    workflows: [],
    register: vi.fn(),
  };

  beforeEach(() => {
    clearCompiledHarnesses();
    vi.mocked(buildPrReviewMergeHarnessSpec).mockReset();
    vi.mocked(compileHarnessSpec).mockReset();
    vi.mocked(buildPrReviewMergeHarnessSpec).mockReturnValue(spec as any);
    vi.mocked(compileHarnessSpec).mockReturnValue(compiled as any);
    compiled.register.mockReset();
  });

  it("creates compile, run, and inspect commands", () => {
    const commands = createLassoCommands(createMockRegistry() as any);

    expect(commands.map(command => command.name)).toEqual([
      "lasso:compile",
      "lasso:run",
      "lasso:inspect",
    ]);
  });

  it("compile command delegates to the reference spec builder and compiler", async () => {
    const commands = createLassoCommands(createMockRegistry() as any);
    const compileCommand = commands.find(command => command.name === "lasso:compile");
    const ctx = createCommandContext();

    await compileCommand?.handler(JSON.stringify(bundle), ctx as any);

    expect(buildPrReviewMergeHarnessSpec).toHaveBeenCalledWith(bundle);
    expect(compileHarnessSpec).toHaveBeenCalledWith(spec);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Compiled `pr-review-merge`"), "info");
  });

  it("run command compiles, registers, and starts the workflow", async () => {
    const registry = createMockRegistry();
    const commands = createLassoCommands(registry as any);
    const runCommand = commands.find(command => command.name === "lasso:run");
    const ctx = createCommandContext();

    await runCommand?.handler(JSON.stringify(bundle), ctx as any);

    expect(buildPrReviewMergeHarnessSpec).toHaveBeenCalledWith(bundle);
    expect(compileHarnessSpec).toHaveBeenCalledWith(spec);
    expect(compiled.register).toHaveBeenCalledWith();
    expect(registry.client.startOrchestration).toHaveBeenCalledWith("instance-123", "pr-review-merge", {});
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Started `pr-review-merge`"), "info");
  });

  it("inspect command prints the spec, cir, and workflow state", async () => {
    const registry = createMockRegistry();
    const commands = createLassoCommands(registry as any);
    const compileCommand = commands.find(command => command.name === "lasso:compile");
    const inspectCommand = commands.find(command => command.name === "lasso:inspect");
    const ctx = createCommandContext();

    await compileCommand?.handler(JSON.stringify(bundle), ctx as any);
    await inspectCommand?.handler("pr-review-merge", ctx as any);

    expect(registry.client.listAllInstances).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("### Lasso Workflow `pr-review-merge`"),
      "info",
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('"name": "pr-review-merge"'),
      "info",
    );
  });

  it("compile command reports malformed bundle JSON cleanly", async () => {
    const commands = createLassoCommands(createMockRegistry() as any);
    const compileCommand = commands.find(command => command.name === "lasso:compile");
    const ctx = createCommandContext();

    await compileCommand?.handler("{not-json", ctx as any);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Invalid LocalPrBundle JSON", "error");
  });
});

function createMockRegistry() {
  const client = {
    startOrchestration: vi.fn().mockResolvedValue(undefined),
    listAllInstances: vi.fn().mockResolvedValue([
      { instanceId: "instance-123", name: "pr-review-merge", status: "Running" },
    ]),
  };

  return {
    client,
    getRuntime: () => ({
      getClient: () => client,
      isRunning: () => true,
    }),
  };
}

function createCommandContext() {
  return {
    pi: {},
    ui: {
      notify: vi.fn(),
    },
  };
}
