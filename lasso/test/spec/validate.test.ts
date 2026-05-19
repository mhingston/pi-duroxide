import { describe, expect, it } from "vitest";
import { validateHarnessSpec } from "../../src/spec/validate.js";
import type { HarnessSpec } from "../../src/spec/types.js";

describe("validateHarnessSpec", () => {
  it("accepts a valid minimal spec", () => {
    const spec: HarnessSpec = {
      name: "pr-review-merge",
      graph: {
        entryNodeId: "load-pr",
        nodes: [
          {
            id: "load-pr",
            kind: "tool",
            tool: "gh",
            args: ["pr", "view", "123"]
          }
        ],
        edges: []
      }
    };

    const result = validateHarnessSpec(spec);
    expect(result.valid).toBe(true);
  });

  it("rejects spec with missing node ID", () => {
    const spec = {
      name: "test-workflow",
      graph: {
        entryNodeId: "start",
        nodes: [
          {
            // missing id
            kind: "tool",
            tool: "echo",
            args: ["hello"]
          }
        ],
        edges: []
      }
    } as any;

    const result = validateHarnessSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes("id"))).toBe(true);
    }
  });

  it("rejects spec with duplicate node IDs", () => {
    const spec: HarnessSpec = {
      name: "test-workflow",
      graph: {
        entryNodeId: "node1",
        nodes: [
          {
            id: "node1",
            kind: "tool",
            tool: "echo",
            args: ["first"]
          },
          {
            id: "node1",
            kind: "tool",
            tool: "echo",
            args: ["second"]
          }
        ],
        edges: []
      }
    };

    const result = validateHarnessSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some(e => e.includes("duplicate") || e.includes("node1"))).toBe(true);
    }
  });

  it("rejects spec with unreachable node", () => {
    const spec: HarnessSpec = {
      name: "test-workflow",
      graph: {
        entryNodeId: "start",
        nodes: [
          {
            id: "start",
            kind: "tool",
            tool: "echo",
            args: ["hello"]
          },
          {
            id: "orphan",
            kind: "tool",
            tool: "echo",
            args: ["unreachable"]
          }
        ],
        edges: []
      }
    };

    const result = validateHarnessSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some(e => e.includes("unreachable") || e.includes("orphan"))).toBe(true);
    }
  });

  it("rejects spec with invalid edge target", () => {
    const spec: HarnessSpec = {
      name: "test-workflow",
      graph: {
        entryNodeId: "start",
        nodes: [
          {
            id: "start",
            kind: "tool",
            tool: "echo",
            args: ["hello"]
          }
        ],
        edges: [
          {
            from: "start",
            to: "nonexistent"
          }
        ]
      }
    };

    const result = validateHarnessSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some(e => e.includes("nonexistent") || e.includes("invalid"))).toBe(true);
    }
  });

  it("rejects retry policy applied to unsupported node kinds", () => {
    const spec: HarnessSpec = {
      name: "test-workflow",
      graph: {
        entryNodeId: "merge",
        nodes: [
          {
            id: "merge",
            kind: "merge",
            waitFor: ["branch1", "branch2"],
            retryPolicy: {
              maxAttempts: 3,
              backoff: "exponential"
            }
          },
          {
            id: "branch1",
            kind: "tool",
            tool: "echo",
            args: ["1"]
          },
          {
            id: "branch2",
            kind: "tool",
            tool: "echo",
            args: ["2"]
          }
        ],
        edges: []
      }
    };

    const result = validateHarnessSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some(e => e.includes("retry") && e.includes("merge"))).toBe(true);
    }
  });

  it("rejects verification rule referencing a missing node", () => {
    const spec: HarnessSpec = {
      name: "test-workflow",
      graph: {
        entryNodeId: "start",
        nodes: [
          {
            id: "start",
            kind: "tool",
            tool: "echo",
            args: ["hello"],
            verificationPolicy: {
              rules: [
                {
                  checkNodeId: "nonexistent-check",
                  onFail: "block"
                }
              ]
            }
          }
        ],
        edges: []
      }
    };

    const result = validateHarnessSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some(e => e.includes("nonexistent-check") || e.includes("verification"))).toBe(true);
    }
  });
});
