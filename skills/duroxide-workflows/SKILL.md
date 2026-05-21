---
name: duroxide-workflows
description: Write durable, crash-resilient workflow extensions for pi using pi-duroxide. Covers generator-based workflow authoring, durable primitives, pi callbacks, error handling, parallel execution, and human-in-the-loop patterns. Use when creating, modifying, or debugging pi workflow extensions.
---

# Duroxide Workflows

> **Durable orchestration for pi.** Use this skill when creating or modifying
> workflow files that register with pi-duroxide via `registerWorkflow()`.
> Use regular pi tools/sessions for one-shot tasks — workflows are for
> multi-step operations that need crash recovery, long-running execution,
> or human approval mid-flow.

## When to Use

| Scenario | Workflow? |
|---|---|
| Multi-step deploy with crash recovery | Yes |
| Data pipeline across many items | Yes |
| Wait for human approval mid-task | Yes |
| Poll an API every 5 minutes for days | Yes |
| One-shot question or analysis | No — use regular pi session |
| Run a bash script with conditionals | No — use a tool directly |

## Quick Start

A workflow is a **generator function** (`function*`) registered via `registerWorkflow()`. Every `yield` pauses execution and persists state to SQLite. If pi crashes, the workflow resumes from the last yield point.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerWorkflow } from "pi-duroxide";

export default function myExtension(pi: ExtensionAPI) {
  registerWorkflow("my-workflow", function* (ctx, input) {
    // yield durable primitives or ctx.pi callbacks
    return { done: true };
  });
}
```

Load the workflow file with: `pi -e ./my-workflow.ts`

## Critical Rules

1. **Always use `function*` with `yield`** — never `async function` with `await`. Duroxide cannot replay async functions.
2. **All yielded values must be JSON-serializable** — no functions, symbols, or circular references.
3. **Yielded data must be deterministic across replays** — use `ctx.utcNow()` instead of `Date.now()`, `ctx.newGuid()` instead of `Math.random()`.
4. **Every `yield` is a persistence point** — progress survives process restarts.

## Generator Fundamentals

```typescript
import type { WorkflowContext } from "pi-duroxide";

// CORRECT: function* with yield
registerWorkflow("good", function* (ctx: WorkflowContext, input: { url: string }) {
  const result = yield ctx.pi.tool("bash", { command: `curl ${input.url}` });
  return { status: result.exitCode === 0 ? "ok" : "fail" };
});

// WRONG: async/await — duroxide cannot replay this
// registerWorkflow("bad", async (ctx, input) => { ... });
```

## Calling Back Into pi

The `ctx.pi` object exposes five durable callback methods. Each is an activity — if the process crashes during the call, the result is replayed from history on restart.

| Method | Returns | Example |
|---|---|---|
| `ctx.pi.llm(messages, opts?)` | Assistant response | `yield ctx.pi.llm([{ role: "user", content: [{ type: "text", text: "Analyze this..." }] }])` |
| `ctx.pi.tool(name, args)` | Tool result | `yield ctx.pi.tool("bash", { command: "npm test" })` |
| `ctx.pi.skill(name, input)` | Skill response | `yield ctx.pi.skill("grafana", "Check service health")` |
| `ctx.pi.sendMessage(content)` | void | `yield ctx.pi.sendMessage("Deploy complete")` |
| `ctx.pi.prompt(prompt, opts?)` | Full pi turn response | `yield ctx.pi.prompt("Summarize these logs...")` |

**LLM call example:**

```typescript
const analysis = yield ctx.pi.llm([
  { role: "user", content: [{ type: "text", text: `Analyze: ${errorLog}` }] },
]);
```

**Tool invocation example:**

```typescript
const files = yield ctx.pi.tool("list-files", { path: "/app/src" });
const content = yield ctx.pi.tool("read", { filePath: "/app/src/main.ts" });
```

## Durable Primitives

All must be `yield`-ed. These survive process restarts.

| Code | Purpose |
|---|---|
| `yield ctx.scheduleTimer(ms)` | Durable sleep |
| `yield ctx.waitForEvent("name")` | Pause until external signal |
| `yield ctx.scheduleSubOrchestration("child", input)` | Run child workflow |
| `yield ctx.utcNow()` | Deterministic current time |
| `yield ctx.newGuid()` | Deterministic UUID |
| `yield ctx.continueAsNew(input)` | Restart with fresh history |

Non-yield helpers:

| Code | Purpose |
|---|---|
| `ctx.setCustomStatus("text")` | Progress visible in dashboard |
| `ctx.kv.set("key", value)` | Durable per-instance storage |
| `ctx.kv.get("key")` | Read from KV store |
| `ctx.traceInfo("message")` | Structured log entry |

## Error Handling

Wrap error-prone sections in try/catch. The workflow continues; errors do not fail the orchestration unless re-thrown.

```typescript
registerWorkflow("resilient", function* (ctx, input) {
  try {
    const build = yield ctx.pi.tool("bash", { command: "npm run build" });
    if (build.exitCode !== 0) throw new Error(`Build failed: ${build.stderr}`);
  } catch (err) {
    yield ctx.pi.sendMessage(`Build failed: ${err.message}`);
    return { status: "build_failed", error: err.message };
  }
  // continue...
});
```

## Parallel Execution

Fan out work. Results return in the order tasks were passed (not completion order):

```typescript
registerWorkflow("parallel-checks", function* (ctx, input) {
  const results = yield ctx.all([
    ctx.pi.tool("bash", { command: "npm test" }),
    ctx.pi.tool("bash", { command: "npm run lint" }),
    ctx.pi.tool("bash", { command: "npm run typecheck" }),
  ]);
  const failed = results.filter((r: any) => r.exitCode !== 0);
  return { allPassed: failed.length === 0 };
});
```

## Human-in-the-Loop

Pause and wait for approval. Signal via `signal-workflow` tool or `/workflow:start`.

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

## Examples

### Deployment Pipeline

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerWorkflow } from "pi-duroxide";

export default function deployExtension(pi: ExtensionAPI) {
  registerWorkflow("deploy", function* (ctx, input: { service: string; tag: string }) {
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
    yield ctx.pi.tool("bash", {
      command: `kubectl set image deployment/${input.service} ${input.service}:${input.tag}`,
    });
    yield ctx.pi.sendMessage(`Deployed ${input.service}@${input.tag}`);
    return { status: "deployed" };
  });
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

    const batch = yield ctx.all(
      chunk.map((file) => ctx.pi.tool("bash", { command: `process ${file}` })),
    );
    results.push(...batch);

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
    yield ctx.scheduleTimer(input.intervalMs);
  }
});
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Workflow times out | SQLite database locked | Only one pi instance per DB file |
| "Orchestration not registered" | Workflow name mismatch | Check name matches `registerWorkflow()` exactly |
| "nondeterministic schedule mismatch" | Non-deterministic yield | Replace `Date.now()` with `ctx.utcNow()`, `Math.random()` with `ctx.newGuid()` |
| Activity result is stale | Expected — cached from replay | Activities are deterministic by design |
| "duroxide not available" | Native binary missing | Run `npm install` in pi-duroxide directory |

## Tools Available to LLM

| Tool | Purpose |
|---|---|
| `start-workflow` | Start a workflow by name, returns `instanceId` |
| `get-workflow` | Get status/output of a workflow instance |
| `list-workflows` | List all instances, optionally filtered |
| `signal-workflow` | Send event to a waiting workflow |
| `wait-for-workflow` | Block until workflow completes |

## Slash Commands

| Command | Purpose |
|---|---|
| `/workflows` | Interactive dashboard of all workflows and instances |
| `/workflow:start <name> [input]` | Quick-start a workflow from CLI |
