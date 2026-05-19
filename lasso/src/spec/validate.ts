import Ajv from "ajv";
import { harnessSpecSchema } from "./schema.js";
import type { HarnessSpec, TaskNode } from "./types.js";

const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(harnessSpecSchema);

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export function validateHarnessSpec(spec: HarnessSpec): ValidationResult {
  const errors: string[] = [];

  // Step 1: Validate against JSON schema
  const schemaValid = validateSchema(spec);
  if (!schemaValid && validateSchema.errors) {
    for (const err of validateSchema.errors) {
      errors.push(`Schema error at ${err.instancePath || "root"}: ${err.message}`);
    }
  }

  // Step 2: Structural validation
  if (spec.graph) {
    const nodeIds = new Set<string>();
    const nodeKinds = new Map<string, string>();

    // Check for duplicate node IDs and collect node metadata
    for (const node of spec.graph.nodes) {
      if (node.id) {
        if (nodeIds.has(node.id)) {
          errors.push(`Duplicate node ID: ${node.id}`);
        }
        nodeIds.add(node.id);
        nodeKinds.set(node.id, node.kind);
      }
    }

    // Validate entry node exists
    if (spec.graph.entryNodeId && !nodeIds.has(spec.graph.entryNodeId)) {
      errors.push(`Entry node not found: ${spec.graph.entryNodeId}`);
    }

    // Validate edge targets exist
    const referencedNodes = new Set<string>();
    if (spec.graph.entryNodeId) {
      referencedNodes.add(spec.graph.entryNodeId);
    }

    for (const edge of spec.graph.edges) {
      if (edge.from && !nodeIds.has(edge.from)) {
        errors.push(`Edge references nonexistent source node: ${edge.from}`);
      }
      if (edge.to && !nodeIds.has(edge.to)) {
        errors.push(`Edge references nonexistent target node: ${edge.to}`);
      }
      if (edge.from) referencedNodes.add(edge.from);
      if (edge.to) referencedNodes.add(edge.to);
    }

    // Check for condition node references
    for (const node of spec.graph.nodes) {
      if (node.kind === "condition") {
        const condNode = node as any;
        if (condNode.thenNodeId) {
          if (!nodeIds.has(condNode.thenNodeId)) {
            errors.push(`Condition node ${node.id} references nonexistent thenNodeId: ${condNode.thenNodeId}`);
          }
          referencedNodes.add(condNode.thenNodeId);
        }
        if (condNode.elseNodeId) {
          if (!nodeIds.has(condNode.elseNodeId)) {
            errors.push(`Condition node ${node.id} references nonexistent elseNodeId: ${condNode.elseNodeId}`);
          }
          referencedNodes.add(condNode.elseNodeId);
        }
      }
    }

    // Check for merge node references
    for (const node of spec.graph.nodes) {
      if (node.kind === "merge") {
        const mergeNode = node as any;
        if (mergeNode.waitFor) {
          for (const waitNodeId of mergeNode.waitFor) {
            if (!nodeIds.has(waitNodeId)) {
              errors.push(`Merge node ${node.id} references nonexistent waitFor node: ${waitNodeId}`);
            }
            referencedNodes.add(waitNodeId);
          }
        }
      }
    }

    // Check for unreachable nodes
    for (const nodeId of nodeIds) {
      if (!referencedNodes.has(nodeId)) {
        errors.push(`Unreachable node: ${nodeId}`);
      }
    }

    // Validate retry policy is only on supported node kinds
    const retryableKinds = new Set(["tool", "llm", "subworkflow"]);
    for (const node of spec.graph.nodes) {
      const nodeAny = node as any;
      if (nodeAny.retryPolicy && !retryableKinds.has(node.kind)) {
        errors.push(`retry policy not supported on node kind "${node.kind}" (node: ${node.id})`);
      }
    }

    // Validate verification policy checkNodeId references
    for (const node of spec.graph.nodes) {
      const nodeAny = node as any;
      if (nodeAny.verificationPolicy?.rules) {
        for (const rule of nodeAny.verificationPolicy.rules) {
          if (rule.checkNodeId && !nodeIds.has(rule.checkNodeId)) {
            errors.push(`Verification rule in node ${node.id} references nonexistent checkNodeId: ${rule.checkNodeId}`);
          }
        }
      }
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
