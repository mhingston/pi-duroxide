import { randomUUID } from "node:crypto";
import type { RegisteredCommand, SourceInfo } from "@mariozechner/pi-coding-agent";
import type { WorkflowRegistry } from "../../../src/workflow-registry.js";
import { compileHarnessSpec, type CompiledHarnessWorkflow } from "../compiler/compile.js";
import { buildPrReviewMergeHarnessSpec } from "../reference/pr-review-merge.js";
import type { LocalPrBundle } from "../reference/types.js";

const compiledHarnesses = new Map<string, CompiledHarnessWorkflow>();
let lastCompiledHarnessName: string | undefined;

export function createLassoCommands(registry: WorkflowRegistry): RegisteredCommand[] {
  const compileCommand: RegisteredCommand = {
    name: "lasso:compile",
    sourceInfo: extSourceInfo(),
    description: "Compile the simulated/local PR review + merge reference workflow from a LocalPrBundle JSON payload.",
    handler: async (args, ctx) => {
      try {
        const bundle = parseBundleArgs(args);
        const compiled = compileReferenceHarness(bundle);
        ctx.ui.notify(
          [
            `Compiled \`${compiled.name}\``,
            `- spec nodes: ${compiled.spec.graph.nodes.length}`,
            `- cir nodes: ${compiled.cir.nodes.length}`,
            `- registered workflows: ${compiled.workflows.length}`,
          ].join("\n"),
          "info",
        );
      } catch (error) {
        ctx.ui.notify(formatCommandError(error), "error");
      }
    },
  };

  const runCommand: RegisteredCommand = {
    name: "lasso:run",
    sourceInfo: extSourceInfo(),
    description: "Compile, register, and start the simulated/local PR review + merge workflow from a LocalPrBundle JSON payload.",
    handler: async (args, ctx) => {
      try {
        const bundle = parseBundleArgs(args);
        const compiled = compileReferenceHarness(bundle);
        compiled.register();

        const runtime = registry.getRuntime();
        if (!runtime) {
          ctx.ui.notify("Workflow runtime not available", "error");
          return;
        }

        const client = runtime.getClient();
        if (!client) {
          ctx.ui.notify("Workflow runtime not started", "error");
          return;
        }

        const instanceId = randomUUID();
        await client.startOrchestration(instanceId, compiled.name, {});
        ctx.ui.notify(`Started \`${compiled.name}\` (${instanceId})`, "info");
      } catch (error) {
        ctx.ui.notify(formatCommandError(error), "error");
      }
    },
  };

  const inspectCommand: RegisteredCommand = {
    name: "lasso:inspect",
    sourceInfo: extSourceInfo(),
    description: "Show the compiled spec, CIR, and workflow runtime state for the latest or named Lasso workflow.",
    handler: async (args, ctx) => {
      try {
        const name = args.trim() || lastCompiledHarnessName;
        if (!name) {
          ctx.ui.notify("No compiled Lasso workflow available. Run /lasso:compile or /lasso:run first.", "error");
          return;
        }

        const compiled = compiledHarnesses.get(name);
        if (!compiled) {
          ctx.ui.notify(`No compiled Lasso workflow named \`${name}\` is available.`, "error");
          return;
        }

        const runtime = registry.getRuntime();
        const client = runtime?.getClient();
        const instances = client ? await client.listAllInstances() : [];
        const matchingInstances = instances.filter(instance => {
          const record = instance as { name?: string };
          return !record.name || record.name === compiled.name;
        });

        ctx.ui.notify(
          [
            `### Lasso Workflow \`${compiled.name}\``,
            "",
            "#### Spec",
            "```json",
            JSON.stringify(compiled.spec, null, 2),
            "```",
            "",
            "#### CIR",
            "```json",
            JSON.stringify(compiled.cir, null, 2),
            "```",
            "",
            "#### Runtime State",
            "```json",
            JSON.stringify(matchingInstances, null, 2),
            "```",
          ].join("\n"),
          "info",
        );
      } catch (error) {
        ctx.ui.notify(formatCommandError(error), "error");
      }
    },
  };

  return [compileCommand, runCommand, inspectCommand];
}

export function clearCompiledHarnesses(): void {
  compiledHarnesses.clear();
  lastCompiledHarnessName = undefined;
}

export function compileReferenceHarness(bundle: LocalPrBundle): CompiledHarnessWorkflow {
  const spec = buildPrReviewMergeHarnessSpec(bundle);
  const compiled = compileHarnessSpec(spec);
  compiledHarnesses.set(compiled.name, compiled);
  lastCompiledHarnessName = compiled.name;
  return compiled;
}

function parseBundleArgs(args: string): LocalPrBundle {
  const trimmed = args.trim();
  if (!trimmed) {
    throw new Error("Usage: /lasso:<compile|run> <LocalPrBundle JSON>");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Invalid LocalPrBundle JSON");
  }

  if (!isLocalPrBundle(parsed)) {
    throw new Error("Invalid LocalPrBundle shape");
  }

  return parsed;
}

function extSourceInfo(): SourceInfo {
  return { path: "", source: "extension", scope: "temporary", origin: "top-level", baseDir: undefined };
}

function formatCommandError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isLocalPrBundle(value: unknown): value is LocalPrBundle {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.repoPath === "string"
    && typeof record.sourceBranch === "string"
    && typeof record.targetBranch === "string"
    && typeof record.reviewInstructions === "string"
    && Array.isArray(record.verificationCommands)
    && record.verificationCommands.every(command => typeof command === "string")
  );
}
