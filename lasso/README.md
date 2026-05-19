# Lasso

Lasso is a workflow compiler and runtime for pi-duroxide, focusing on durable, replay-safe workflows with spec validation, lowering, and compilation.

## Local Incubation Model

Lasso is developed as a separate package layered on top of `pi-duroxide`. The MVP proves that Lasso can:

- Validate and compile a constrained public workflow spec
- Lower specs into a replay-safe compiler IR
- Execute and inspect compiled workflows
- Support tools, conditions, verification steps, and optional human approval gates

The reference workflow is a **simulated/local PR review + merge** flow:

1. Load PR context from the local repository or worktree
2. Run review-oriented analysis using tool and optional LLM nodes
3. Run deterministic verification steps (tests, lint, custom checks)
4. Branch explicitly on verification or review outcomes
5. Optionally pause for human approval before merge
6. Perform a local simulated merge with real git operations
7. Run post-merge verification
8. Emit an inspectable terminal outcome

This exercise validates the full workflow model without coupling to remote platform concerns.

## Package Structure

- `src/index.ts` — Public API entrypoints for spec validation, lowering, compilation, and extension bootstrap
- `src/pi/extension.ts` — Pi extension for Lasso bootstrap
- `src/spec/` — Spec validation (filled in by later tasks)
- `src/cir/` — Compiler IR lowering (filled in by later tasks)
- `src/compiler/` — Spec-to-IR compilation (filled in by later tasks)
