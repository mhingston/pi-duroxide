# Lasso

Lasso is a workflow compiler layered on top of `pi-duroxide`. It validates a declarative `HarnessSpec`, lowers it to CIR, compiles it into replay-safe workflows, and exposes a thin pi adapter for compile/run/inspect operations.

## Local incubation model

Lasso currently lives in the same repository as `pi-duroxide`, but it is treated as a separate package above the durable runtime substrate.

- `pi-duroxide` owns workflow lifecycle, replay, timers, events, and runtime registration
- Lasso owns spec validation, CIR lowering, compilation, reference workflow construction, and operator-facing commands

## Reference workflow

The MVP reference workflow is a **simulated/local PR review + merge** flow. It uses:

1. tool nodes to inspect the repo, run verification commands, and perform a local merge
2. an LLM review node
3. explicit merge and condition nodes
4. a human approval gate
5. explicit retry and verification behavior after merge

The workflow never calls live GitHub APIs. Everything happens against a local fixture repository or worktree.

## Pi adapter commands

When the Lasso extension is loaded, it first boots the underlying `pi-duroxide` workflow extension and then adds three slash commands:

- `/lasso:compile <LocalPrBundle JSON>`
- `/lasso:run <LocalPrBundle JSON>`
- `/lasso:inspect [workflow-name]`

`compile` builds the reference `HarnessSpec`, validates it, lowers it to CIR, and stores the compiled artifact in memory.

`run` compiles the same reference workflow, registers it with `pi-duroxide`, and starts an orchestration instance.

`inspect` shows the compiled spec, the lowered CIR, and the current workflow instances reported by the durable runtime.

## Simulated PR workflow input

The adapter currently targets the reference workflow input shape:

```json
{
  "repoPath": "/absolute/path/to/repo",
  "sourceBranch": "feature/pr-change",
  "targetBranch": "main",
  "reviewInstructions": "Approve only if verification passes and the diff looks safe.",
  "verificationCommands": [
    "node -e \"process.exit(0)\""
  ]
}
```

## Non-goals

The MVP does **not** include:

- live GitHub or `gh` integration
- planner or synthesis layers
- adaptive replanning
- arbitrary generated TypeScript

## Package structure

- `src/spec/` — public spec types, schema, and validator
- `src/cir/` — internal execution contract and lowering
- `src/compiler/` — replay-safe workflow compiler and runtime helpers
- `src/reference/` — simulated/local PR review + merge reference workflow
- `src/pi/` — thin pi adapter surface
