import { describe, expect, it } from "vitest";
import { buildPatchValidationHarnessSpec } from "../../src/reference/patch-validation.js";
import { validateHarnessSpec } from "../../src/spec/validate.js";
import type { LocalPatchValidationBundle } from "../../src/reference/types.js";

const ALWAYS_PRESENT_TERMINAL_IDS = ["validated-fix", "not-reproduced", "apply-failed", "candidate-failed"];
const APPROVAL_ONLY_TERMINAL_IDS = ["rejected"];

describe("buildPatchValidationHarnessSpec", () => {
  it("builds a valid serial spec for a branch candidate source", () => {
    const bundle: LocalPatchValidationBundle = {
      repoPath: "/tmp/repo",
      baselineRef: "HEAD",
      candidateSource: { kind: "branch", value: "fix/bug-123" },
      reproduceCommands: ["npm test -- failing.spec.ts"],
      verificationCommands: ["npm test", "npm run build"],
      reviewInstructions: "Approve only if baseline fails and candidate passes.",
      approvalRequired: true,
    };

    const spec = buildPatchValidationHarnessSpec(bundle);

    expect(spec.name).toBe("patch-validation");
    expect(spec.graph.entryNodeId).toBeDefined();

    const nodeKinds = spec.graph.nodes.map(n => n.kind);
    expect(nodeKinds).not.toContain("merge");

    const nodeIds = spec.graph.nodes.map(n => n.id);
    for (const terminal of ALWAYS_PRESENT_TERMINAL_IDS) {
      expect(nodeIds).toContain(terminal);
    }
    for (const terminal of APPROVAL_ONLY_TERMINAL_IDS) {
      expect(nodeIds).toContain(terminal);
    }

    const allTerminalIds = [...ALWAYS_PRESENT_TERMINAL_IDS, ...APPROVAL_ONLY_TERMINAL_IDS];
    const terminalNodes = spec.graph.nodes.filter(n => allTerminalIds.includes(n.id));
    for (const node of terminalNodes) {
      expect(node.kind).toBe("subworkflow");
    }
  });

  it("builds a valid serial spec for a patch-file candidate source", () => {
    const bundle: LocalPatchValidationBundle = {
      repoPath: "/tmp/repo",
      baselineRef: "HEAD",
      candidateSource: { kind: "patchFile", value: "/patches/fix.patch" },
      reproduceCommands: ["cargo test buggy_test"],
      verificationCommands: ["cargo test", "cargo clippy"],
      reviewInstructions: "Validate the patch fixes the regression.",
      approvalRequired: false,
    };

    const spec = buildPatchValidationHarnessSpec(bundle);

    expect(spec.name).toBe("patch-validation");

    const nodeKinds = spec.graph.nodes.map(n => n.kind);
    expect(nodeKinds).not.toContain("merge");

    const nodeIds = spec.graph.nodes.map(n => n.id);
    for (const terminal of ALWAYS_PRESENT_TERMINAL_IDS) {
      expect(nodeIds).toContain(terminal);
    }
    for (const terminal of APPROVAL_ONLY_TERMINAL_IDS) {
      expect(nodeIds).not.toContain(terminal);
    }
  });

  it("includes a human gate node when approvalRequired is true", () => {
    const bundle: LocalPatchValidationBundle = {
      repoPath: "/tmp/repo",
      baselineRef: "HEAD",
      candidateSource: { kind: "branch", value: "fix/bug-123" },
      reproduceCommands: ["npm test"],
      verificationCommands: ["npm test"],
      reviewInstructions: "Review required.",
      approvalRequired: true,
    };

    const spec = buildPatchValidationHarnessSpec(bundle);
    const humanNodes = spec.graph.nodes.filter(n => n.kind === "human");
    expect(humanNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("omits the human gate node when approvalRequired is false", () => {
    const bundle: LocalPatchValidationBundle = {
      repoPath: "/tmp/repo",
      baselineRef: "HEAD",
      candidateSource: { kind: "patchFile", value: "/patches/fix.patch" },
      reproduceCommands: ["npm test"],
      verificationCommands: ["npm test"],
      reviewInstructions: "No human review.",
      approvalRequired: false,
    };

    const spec = buildPatchValidationHarnessSpec(bundle);
    const humanNodes = spec.graph.nodes.filter(n => n.kind === "human");
    expect(humanNodes).toHaveLength(0);
  });

  it("has a linear edge chain with no merge node (serial ordering)", () => {
    const bundle: LocalPatchValidationBundle = {
      repoPath: "/tmp/repo",
      baselineRef: "HEAD",
      candidateSource: { kind: "branch", value: "fix/bug-123" },
      reproduceCommands: ["npm test"],
      verificationCommands: ["npm test"],
      reviewInstructions: "Approve.",
      approvalRequired: false,
    };

    const spec = buildPatchValidationHarnessSpec(bundle);

    // No merge nodes — the workflow must be serial
    const mergeNodes = spec.graph.nodes.filter(n => n.kind === "merge");
    expect(mergeNodes).toHaveLength(0);

    // No fan-in: no node should appear as an edge target more than once
    const edgeTargets = spec.graph.edges.map(e => e.to);
    const targetCounts = new Map<string, number>();
    for (const t of edgeTargets) {
      targetCounts.set(t, (targetCounts.get(t) ?? 0) + 1);
    }
    for (const [nodeId, count] of targetCounts) {
      expect(count, `node ${nodeId} has ${count} incoming edges (fan-in detected)`).toBe(1);
    }
  });

  it("produces a spec that passes schema validation when approvalRequired is true", () => {
    const bundle: LocalPatchValidationBundle = {
      repoPath: "/tmp/repo",
      baselineRef: "HEAD",
      candidateSource: { kind: "branch", value: "fix/bug-123" },
      reproduceCommands: ["npm test"],
      verificationCommands: ["npm test"],
      reviewInstructions: "Approve.",
      approvalRequired: true,
    };

    const result = validateHarnessSpec(buildPatchValidationHarnessSpec(bundle));
    expect(result.valid, (result as any).errors?.join(", ")).toBe(true);
  });

  it("produces a spec that passes schema validation when approvalRequired is false", () => {
    const bundle: LocalPatchValidationBundle = {
      repoPath: "/tmp/repo",
      baselineRef: "HEAD",
      candidateSource: { kind: "patchFile", value: "/patches/fix.patch" },
      reproduceCommands: ["npm test"],
      verificationCommands: ["npm test"],
      reviewInstructions: "No approval.",
      approvalRequired: false,
    };

    const result = validateHarnessSpec(buildPatchValidationHarnessSpec(bundle));
    expect(result.valid, (result as any).errors?.join(", ")).toBe(true);
  });
});
