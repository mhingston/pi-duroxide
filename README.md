# pi-duroxide — Durable Workflow Orchestration for pi

A pi extension that integrates [duroxide-node](https://github.com/microsoft/duroxide-node)
to provide durable, deterministic workflow orchestration. Workflows are TypeScript
generator functions that survive process restarts, support long-running operations,
and can call back into pi for LLM turns, tool invocations, and message sending.

The pi session or process can crash mid-workflow. When it restarts, the workflow
resumes from its last yield point — no data loss, no manual recovery.

## Quick Start

```bash
# 1. Install pi-duroxide
pi install npm:pi-duroxide
```

```typescript
// my-workflow.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerWorkflow } from "@mariozechner/pi-duroxide";

export default function (pi: ExtensionAPI) {
  registerWorkflow("echo", function* (_ctx, input) {
    return { echoed: input };
  });
}
```

```bash
# 2. Start pi with both the workflow engine and your workflow file
pi -e ./packages/pi-duroxide -e ./my-workflow.ts
```

> **Note:** pi-duroxide provides the runtime engine. Your workflow files are
> separate extensions that import `registerWorkflow` from pi-duroxide.

---

## Table of Contents

- [What This Extension Does](#what-this-extension-does)
- [Why Durable Workflows?](#why-durable-workflows)
- [When to Use](#when-to-use)
- [Installation](#installation)
- [Workflow Authoring Guide](#workflow-authoring-guide)
  - [Anatomy of a Workflow](#anatomy-of-a-workflow)
  - [Generator Fundamentals](#generator-fundamentals)
  - [Calling Back Into pi](#calling-back-into-pi)
  - [Durable Primitives](#durable-primitives)
  - [Error Handling](#error-handling)
  - [Parallel Execution](#parallel-execution)
  - [Human-in-the-Loop with Events](#human-in-the-loop-with-events)
  - [Timers and Delays](#timers-and-delays)
- [Tool Reference](#tool-reference)
  - [start-workflow](#start-workflow)
  - [get-workflow](#get-workflow)
  - [list-workflows](#list-workflows)
  - [signal-workflow](#signal-workflow)
  - [wait-for-workflow](#wait-for-workflow)
- [Slash Commands](#slash-commands)
- [Real-World Examples](#real-world-examples)
  - [Deployment Pipeline](#deployment-pipeline)
  - [Data Processing Pipeline](#data-processing-pipeline)
  - [Scheduled Health Check](#scheduled-health-check)
- [How It Works](#how-it-works)
  - [Architecture](#architecture)
  - [Crash Recovery](#crash-recovery)
  - [SQLite Storage](#sqlite-storage)
- [Development](#development)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

---

## What This Extension Does

pi-duroxide adds _durable workflow execution_ to pi. A durable workflow is a
TypeScript generator function that:

1. **Persists progress** after every `yield` — if pi crashes, the workflow resumes
   from the last yield point, not from the beginning.
2. **Runs asynchronously** — workflows execute in a background runtime. Your pi
   session continues normally while the workflow runs.
3. **Can call back into pi** — from inside a workflow you can invoke the LLM,
   execute pi tools (read, bash, edit, etc.), run a skill, or send messages
   back to the session.
4. **Supports long-running patterns** — timers, external event waiting, parallel
   fan-out, sub-workflows, and infinite (continue-as-new) loops.

## Why Durable Workflows?

Without durability, the pi agent must complete a task in a single session. If
the process dies, everything restarts from scratch. With pi-duroxide:

- **Crash resilience**: Kill pi mid-deployment. Restart it. The deployment resumes
  from where it stopped.
- **Long-running tasks**: Run workflows that take hours or days. A "run tests →
  deploy → verify → rollback if needed" pipeline can span multiple sessions.
- **Deterministic replay**: Every replay produces the same sequence of yield
  points. Side effects (LLM calls, tool invocations) are deduplicated by the
  runtime.
- **Observability**: Check workflow status, custom status messages, and KV store
  from the LLM or the `/workflows` dashboard while the workflow is running.

## When to Use

| Use Case | pi workflow? | Regular pi session? |
|---|---|---|
| One-shot question | No | Yes |
| Multi-step deploy with crash recovery | Yes | No |
| Data pipeline across 100 items | Yes | No |
| Wait for human approval mid-task | Yes | No |
| Poll an API every 5 minutes for days | Yes | No |
| Run a bash script with conditionals | No (use a tool) | Yes |

## Installation

### From npm

```bash
pi install npm:pi-duroxide
```

### From the monorepo (development)

```bash
pi install ./packages/pi-duroxide
```

### From settings.json

```json
{
  "extensions": ["path/to/pi-duroxide/src/index.ts"]
}
```

### From command line

```bash
pi -e ./packages/pi-duroxide/src/index.ts
```

---

## Workflow Authoring Guide

### Anatomy of a Workflow

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerWorkflow } from "@mariozechner/pi-duroxide";

export default function myExtension(pi: ExtensionAPI) {
  registerWorkflow("my-workflow", function* (ctx, input) {
    // Yield duroxide primitives or pi callbacks
    return { done: true };
  });
}
```

### Generator Fundamentals

Workflows are `function*` generators — never `async function`. Every `yield`
pauses the workflow and persists its state to SQLite. The runtime replays the
generator deterministically.

```typescript
import type { WorkflowContext } from "@mariozechner/pi-duroxide";

// DO: use function* with yield
registerWorkflow("good", function* (ctx: WorkflowContext, input: { url: string }) {
  const result = yield ctx.pi.tool("bash", { command: `curl ${input.url}` });
  return { status: result.exitCode === 0 ? "ok" : "fail" };
});

// DON'T: use async/await — duroxide cannot replay async functions
// registerWorkflow("bad", async (ctx, input) => { ... });
```

### Calling Back Into pi

The `ctx.pi` object exposes five callback methods. Each one is a durable
activity — if the process crashes during the call, the activity result is
replayed from history on restart.

| Method | What it does |
|---|---|
| `ctx.pi.llm(messages, opts?)` | Calls the LLM with the session's active provider/model. Returns assistant response. |
| `ctx.pi.tool(name, args)` | Executes a registered pi tool (read, bash, edit, write, etc.) |
| `ctx.pi.skill(name, input)` | Loads a skill markdown, calls the LLM with it as system prompt |
| `ctx.pi.sendMessage(content)` | Appends a message to the pi session's message list |
| `ctx.pi.prompt(prompt, opts?)` | Full pi turn: new conversation, sends prompt, returns complete response |

**Example — LLM call inside a workflow:**

```typescript
const analysis = yield ctx.pi.llm([
  { role: "user", content: [{ type: "text", text: `Analyze this error: ${errorLog}` }] },
]);

// analysis = { role: "assistant", content: "The error indicates..." }
```

**Example — tool invocation:**

```typescript
const files = yield ctx.pi.tool("list-files", { path: "/app/src" });
const content = yield ctx.pi.tool("read", { filePath: "/app/src/main.ts" });
```

**Example — send a message back to the session:**

```typescript
yield ctx.pi.sendMessage(`Deployed ${version} to production. Status: ${status}`);
```

### Durable Primitives

Beyond pi callbacks, the `ctx` object exposes duroxide's durable primitives.
All of these must be `yield`-ed:

| Code | What it does |
|---|---|
| `yield ctx.scheduleTimer(5000)` | Sleep for 5 seconds (durable — survives restarts) |
| `yield ctx.waitForEvent("deploy-approved")` | Pause until an external event arrives |
| `yield ctx.scheduleSubOrchestration("child-wf", input)` | Run a child workflow, await its result |
| `yield ctx.utcNow()` | Get the current time (deterministic — same value on replay) |
| `yield ctx.newGuid()` | Generate a UUID (deterministic — same value on replay) |
| `yield ctx.continueAsNew(input)` | Restart the workflow with fresh history (eternal workflows) |

Non-yield helpers:

| Code | What it does |
|---|---|
| `ctx.setCustomStatus("deploying")` | Set progress visible in dashboard and tools |
| `ctx.kv.set("key", value)` | Durable per-instance key-value storage |
| `ctx.kv.get("key")` | Read from KV store |
| `ctx.traceInfo("started step 3")` | Structured log entry |

### Error Handling

Wrap error-prone sections in try/catch. The workflow continues; the error does
not fail the orchestration unless you re-throw.

```typescript
registerWorkflow("resilient-deploy", function* (ctx, input) {
  try {
    const build = yield ctx.pi.tool("bash", { command: "npm run build" });
    if (build.exitCode !== 0) throw new Error(`Build failed: ${build.stderr}`);
  } catch (err) {
    yield ctx.pi.sendMessage(`Build failed: ${err.message}. Skipping deploy.`);
    return { status: "build_failed", error: err.message };
  }
  // continue with deploy...
});
```

Use `scheduleActivityWithRetry` for transient failures:

```typescript
// Requires registering a duroxide activity on the runtime
const result = yield ctx.scheduleActivityWithRetry("call-external-api",
  { endpoint: "/health" },
  { maxRetries: 3, backoffCoefficient: 2 },
);
```

### Parallel Execution

Fan out work across parallel activities. Results return in the order the tasks
were passed (not completion order):

```typescript
registerWorkflow("parallel-checks", function* (ctx, input) {
  const results = yield ctx.all([
    ctx.pi.tool("bash", { command: "npm test" }),
    ctx.pi.tool("bash", { command: "npm run lint" }),
    ctx.pi.tool("bash", { command: "npm run typecheck" }),
  ]);

  const failed = results.filter((r: any) => r.exitCode !== 0);
  return { allPassed: failed.length === 0, failedCount: failed.length };
});
```

### Human-in-the-Loop with Events

Pause a workflow and wait for human approval. Someone signals the workflow using
the `signal-workflow` tool via the LLM, or the `/workflow:start` slash command.

```typescript
registerWorkflow("approve-deploy", function* (ctx, input) {
  yield ctx.pi.sendMessage(`Requesting approval to deploy ${input.version}`);

  ctx.setCustomStatus("awaiting-approval");
  const decision = yield ctx.waitForEvent("deploy-decision");

  if (decision.action === "approve") {
    yield ctx.pi.tool("bash", { command: `deploy ${input.version}` });
    return { status: "deployed" };
  }
  return { status: "rejected", reason: decision.reason };
});
```

Signal from the LLM:

> "Approve the deploy for instance abc-123"

The LLM calls `signal-workflow` with:

```json
{
  "instanceId": "abc-123",
  "eventName": "deploy-decision",
  "data": { "action": "approve", "reason": "Looks good" }
}
```

### Timers and Delays

Schedule delays that survive process restarts:

```typescript
registerWorkflow("delayed-action", function* (ctx, input) {
  yield ctx.pi.sendMessage(`Will deploy ${input.version} in 5 minutes`);
  yield ctx.scheduleTimer(300_000); // 5 minutes — survives crash

  // If pi restarts during the timer, it waits the remaining time
  const result = yield ctx.pi.tool("bash", { command: `deploy ${input.version}` });
  yield ctx.pi.sendMessage(`Deploy result: ${JSON.stringify(result)}`);
  return result;
});
```

---

## Tool Reference

Five tools registered by the extension for LLM interaction.

### `start-workflow`

Start a durable workflow by name. Returns an `instanceId` for tracking.

| Parameter | Type | Description |
|---|---|---|
| `name` | string (required) | Registered workflow name |
| `input` | any (required) | JSON input passed to the workflow generator |
| `id` | string (optional) | Explicit instance ID (auto-generated if omitted) |

**Example LLM call:**

```
start-workflow(name="deploy-service", input={"service":"api","version":"1.2.3"})
```

**Returns:**

```json
{ "instanceId": "a1b2c3d4-e5f6-..." }
```

### `get-workflow`

Get the status, output, and custom status of a workflow instance.

| Parameter | Type | Description |
|---|---|---|
| `instanceId` | string (required) | Workflow instance ID |

**Returns:** Orchestration state object with `status`, `output`, `customStatus`, and timestamps.

### `list-workflows`

List all workflow instances, optionally filtered.

| Parameter | Type | Description |
|---|---|---|
| `name` | string (optional) | Filter by workflow name |
| `status` | string (optional) | Filter: `Running`, `Completed`, `Failed`, `Terminated`, `Pending` |

**Returns:** Array of orchestration instances.

### `signal-workflow`

Send an external event to a workflow waiting on `ctx.waitForEvent()`.

| Parameter | Type | Description |
|---|---|---|
| `instanceId` | string (required) | Target workflow instance |
| `eventName` | string (required) | Must match the name in `waitForEvent()` |
| `data` | any (required) | JSON payload delivered to the workflow |

**Returns:**

```json
{ "signalled": true }
```

### `wait-for-workflow`

Block until a workflow completes and return its output.

| Parameter | Type | Description |
|---|---|---|
| `instanceId` | string (required) | Workflow instance ID |
| `timeoutMs` | number (optional) | Maximum wait in ms (default: 60000) |

**Returns:** Full orchestration state including `output`.

---

## Slash Commands

### `/workflows`

Interactive dashboard showing:
- All registered workflow names
- Running/completed/failed orchestration instances with status and custom status
- Workflow runtime status (running/stopped)

### `/workflow:start <name> [input JSON]`

Quick-start a workflow from the command line without going through the LLM.

```bash
/workflow:start deploy-service {"service":"api","version":"1.2.3"}
```

Tab-completion suggests registered workflow names.

---

## Real-World Examples

### Deployment Pipeline

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerWorkflow } from "@mariozechner/pi-duroxide";

export default function myExtension(pi: ExtensionAPI) {
  registerWorkflow<{ service: string; tag: string }, { status: string; url?: string }>(
    "deploy",
    function* (ctx, input) {
      ctx.setCustomStatus("building");
      const build = yield ctx.pi.tool("bash", {
        command: `docker build -t ${input.service}:${input.tag} .`,
      });
      if (build.exitCode !== 0) throw new Error("Build failed");

      ctx.setCustomStatus("testing");
      const tests = yield ctx.pi.tool("bash", {
        command: `npm test -- --filter=${input.service}`,
      });
      if (tests.exitCode !== 0) {
        ctx.setCustomStatus("awaiting-approval");
        const decision = yield ctx.waitForEvent("deploy-decision");
        if (decision !== "proceed") return { status: "aborted" };
      }

      ctx.setCustomStatus("deploying");
      const deploy = yield ctx.pi.tool("bash", {
        command: `kubectl set image ${input.service}:${input.tag}`,
      });

      const url = `https://${input.service}.staging.example.com`;
      yield ctx.pi.sendMessage(`Deployed ${input.service}@${input.tag}`);
      return { status: "deployed", url };
    },
    { description: "Build, test, and deploy a service" },
  );
}
```

### Data Processing Pipeline

```typescript
registerWorkflow("process-files", function* (ctx, input: { files: string[] }) {
  const CHUNK_SIZE = 10;
  const results = [];

  for (let i = 0; i < input.files.length; i += CHUNK_SIZE) {
    const chunk = input.files.slice(i, i + CHUNK_SIZE);
    ctx.setCustomStatus(`processing batch ${Math.floor(i / CHUNK_SIZE) + 1}`);

    // Process files in parallel within each chunk
    const batch = yield ctx.all(
      chunk.map((file) => ctx.pi.tool("bash", { command: `process ${file}` })),
    );
    results.push(...batch);

    // Yield control so progress persists after each chunk
    yield ctx.pi.sendMessage(`Processed ${results.length}/${input.files.length} files`);
  }

  return { processed: results.length, results };
});
```

### Scheduled Health Check

```typescript
registerWorkflow("health-monitor", function* (ctx, input: { url: string; intervalMs: number }) {
  let failures = 0;

  while (true) {
    const result = yield ctx.pi.tool("bash", {
      command: `curl -s -o /dev/null -w '%{http_code}' ${input.url}`,
    });

    const statusCode = parseInt(result.trim(), 10);
    if (statusCode >= 400) {
      failures++;
      yield ctx.pi.sendMessage(`Health check failed: ${input.url} returned ${statusCode}`);
    } else {
      failures = 0;
    }

    if (failures >= 3) {
      yield ctx.pi.sendMessage(`ALERT: ${input.url} down — 3 consecutive failures`);
      failures = 0;
    }

    // Wait for next check interval (durable — survives restarts)
    yield ctx.scheduleTimer(input.intervalMs);

    // Every 100 iterations, restart with fresh history to avoid unbounded growth
    // (This pattern requires continueAsNew support — available in duroxide 0.1.25+)
    // yield ctx.continueAsNew(input);
  }
});
```

---

## How It Works

### Architecture

```
pi session
   └── pi-duroxide extension
        ├── WorkflowRegistry   — maps workflow names to generators, queues
        │                        registrations, flushes them at session start
        ├── WorkflowRuntime    — manages duroxide Runtime + Client lifecycle
        │   └── SqliteProvider — connects to ~/.pi/agent/workflows.db
        ├── PiClient (impl)    — creates ctx.pi object wrapping scheduleActivity
        │     __pi_llm, __pi_tool, __pi_skill, __pi_sendMessage, __pi_prompt
        ├── PiClient (bindings) — wires each activity to ExtensionContext methods
        │     tool → ctx.executeTool(name, args)
        │     llm  → ctx.streamLlm(messages, opts)
        │     skill → loadSkill() + ctx.streamLlm()
        │     prompt → ctx.streamLlm([user message])
        │     sendMessage → pi.sendMessage()
        ├── workflow-tools     — 5 tool definitions registered on ExtensionAPI
        └── workflow-commands  — 2 slash commands registered on ExtensionAPI
```

Workflows are registered via `WorkflowRegistry.enqueue()` during extension
loading. On session start, pending registrations are flushed and the duroxide
runtime starts. Workflows execute as duroxide orchestrations — each `yield`
persists progress to SQLite.

### Crash Recovery

```
1. pi process dies while a workflow is mid-execution
2. On restart, pi loads extensions → pi-duroxide factory runs
3. SqliteProvider opens the same ~/.pi/agent/workflows.db
4. duroxide detects incomplete orchestrations in the database
5. Replays history from the last persisted yield point
6. Side-effect activities (__pi_llm, __pi_tool) return cached results from history
7. Workflow resumes from exactly where it stopped — no lost progress
```

### SQLite Storage

Default location: `~/.pi/agent/workflows.db`

The database stores:
- Orchestration state (status, input, output, custom status)
- Event history for replay (all yield points and activity results)
- Work item queue (pending activities)
- KV store data

Schema is managed entirely by duroxide — no manual migration needed.

SQLite uses WAL mode for concurrent reads. The duroxide runtime's internal
dispatchers and workers may produce transient `database is locked` warnings
under heavy activity — these resolve automatically via built-in retry. Only one
pi process should use a given `workflows.db` file at a time.

For multi-instance production deployments, duroxide supports PostgreSQL via
`PostgresProvider`. This is not yet exposed — SQLite is sufficient for the
single-user desktop use case.

---

## Development

### Setup

```bash
cd packages/pi-duroxide
npm install
```

### Running Tests

```bash
# All tests
npx vitest --run

# Single test file
npx vitest --run test/WorkflowRegistry.test.ts

# Integration tests (duroxide runtime required)
npx vitest --run test/RuntimeLifecycle.test.ts

# E2E tests (loads extension through pi's harness)
npx vitest --run test/E2EWorkflow.test.ts

# Real E2E tests (exercises ctx.pi bindings through real extension context)
npx vitest --run test/RealBindingsE2E.test.ts
```

Tests are organized as:
- **Unit tests**: WorkflowRegistry, WorkflowTools, WorkflowCommands (no duroxide needed)
- **Integration tests**: RuntimeLifecycle, PiClientActivities, SimpleWorkflow, LlmActivity, Parallel, EventSignal (duroxide runtime required)
- **E2E test**: E2EWorkflow (loads extension through pi's harness)

### Test Files

| File | Tests | Category |
|---|---|---|
| `test/WorkflowRegistry.test.ts` | 4 | Unit |
| `test/WorkflowTools.test.ts` | 4 | Unit |
| `test/WorkflowCommands.test.ts` | 4 | Unit |
| `test/RuntimeLifecycle.test.ts` | 4 | Integration |
| `test/PiClientActivities.test.ts` | 2 | Integration |
| `test/SimpleWorkflow.test.ts` | 2 | Integration |
| `test/LlmActivity.test.ts` | 1 | Integration |
| `test/Parallel.test.ts` | 1 | Integration |
| `test/EventSignal.test.ts` | 1 | Integration |
| `test/E2EWorkflow.test.ts` | 1 | E2E |
| `test/BindingsE2E.test.ts` | 4 | Integration |
| `test/RealBindingsE2E.test.ts` | 5 | E2E |

---

## Limitations

- **No async/await in workflows**: Generators only. TypeScript will not catch
  this at compile time — review code carefully.
- **All yielded values must be JSON-serializable**: duroxide persists them to
  SQLite. Functions, symbols, and circular references will break.
- **Yielded data must be deterministic across replays**: duroxide replays the
  generator to rebuild state. If a `yield` produces different input on replay
  (e.g., `Date.now()` inside a generator), duroxide rejects it as a
  nondeterministic schedule mismatch. Use `ctx.utcNow()` instead of `Date.now()`,
  and `ctx.newGuid()` instead of `Math.random()`. Note that `ctx.pi.llm()`,
  `ctx.pi.prompt()`, and `ctx.pi.skill()` strip `timestamp` fields from messages
  before scheduling activities to avoid this issue.
- **duroxide adds ~15MB native binary**: macOS (x64 + arm64) supported. Other
  platforms may need a build from source.
- **Skill loading uses standard paths only**: `ctx.pi.skill()` looks for skill files
  in `~/.pi/agent/skills/<name>/<name>.md` and `<cwd>/.pi/skills/<name>/<name>.md`.
- **`session_start` fires in production**: The duroxide runtime starts when
  the pi session starts. In test harnesses, you need to start it manually.
- **Single-instance SQLite**: Only one pi process should use a given
  `workflows.db` file at a time. Concurrent access from multiple processes
  will cause locking errors.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| "duroxide not available" warning at startup | duroxide native binary not installed | Run `npm install` in pi-duroxide directory |
| "Workflow runtime not started" from a tool | Tools registered before runtime is ready | Ensure session_start fires (production) or start runtime manually (tests) |
| Workflow times out without completing | SQLite database locked | Only one pi instance per DB file |
| "Orchestration not registered" in logs | Workflow name mismatch in `start-workflow` | Check the name matches exactly what was registered |
| "nondeterministic schedule mismatch" in logs | Generator produces different input on replay | Don't use `Date.now()` or `Math.random()` inside generators — use `ctx.utcNow()` and `ctx.newGuid()` |
| Activity result is stale/old | duroxide returned cached result from replay | This is expected — activities are deterministic by design |

---

## License

MIT
