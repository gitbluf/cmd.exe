# PHASE 3: Swarm Orchestration

**Status:** Planning  
**Priority:** P1  
**Scope:** Implement `/dispath:dispatch` for concurrent multi-agent execution  
**Effort:** ~4 hours  
**Depends On:** Phase 1 (Agent Specialization) + Phase 2 (Plan-First Workflow)

## 📋 Overview

Implement Neurogrid-style swarm orchestration where users can dispatch multiple agent tasks to run concurrently. Each task runs in its own isolated session with configurable concurrency, timeout, and optional git worktree isolation.

```
/dispath:dispatch task-1 dataweaver "Find API endpoints" | task-2 blackice "Review security"
```

Results are automatically recorded to `.ai/.dispath-swarms.json` with full metadata.

---

## 🎯 Success Criteria

- [x] `/dispath:dispatch` parses multiple tasks with `|` separator
- [x] Each task runs in parallel with configurable concurrency (default 5)
- [x] Per-task timeout enforcement (default 300s)
- [x] Optional git worktree isolation per task
- [x] Swarm history auto-recorded to `.ai/.dispath-swarms.json`
- [x] Swarm status queryable via `/dispath:swarm-status <id>`
- [x] Swarm can be aborted via `/dispath:swarm-abort <id>`
- [x] Swarm output collected and truncated intelligently
- [x] Token usage tracked per task
- [x] Build passes, zero warnings

---

## 📐 Technical Specification

### 1. Swarm Data Types

Create `src/swarms/types.ts`:

```typescript
export interface SwarmTask {
  id: string;                    // task-1, task-2, etc.
  agent: string;                 // cortex, blueprint, dataweaver, etc.
  request: string;               // What to do
  status: "pending" | "running" | "completed" | "failed" | "timeout" | "cancelled";
  sessionId?: string;            // Pi session ID
  output?: string;               // Truncated to 500 chars
  fullOutputPath?: string;       // Path to full output log (optional)
  error?: string;                // Error message if failed
  tokens?: {
    input: number;
    output: number;
  };
  startedAt?: ISO8601;
  completedAt?: ISO8601;
  duration?: number;             // milliseconds
  worktreeId?: string;           // If using git worktree
}

export interface SwarmRecord {
  id: string;                    // swarm-abc123
  createdAt: ISO8601;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  completedAt?: ISO8601;
  tasks: SwarmTask[];
  options: SwarmOptions;
  summary?: string;              // Auto-generated summary of results
  stats: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalTokens: { input: number; output: number };
    totalDuration: number;       // milliseconds
  };
}

export interface SwarmOptions {
  concurrency: number;           // Max parallel tasks (1-20, default 5)
  timeout: number;               // Per-task timeout in ms (default 300000 = 5min)
  worktrees: boolean;            // Enable git worktree isolation
  recordOutput: "none" | "truncated" | "full";  // How to record output
  retryFailed: boolean;          // Retry failed tasks (default false)
}

export type SwarmStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
```

### 2. Swarm Registry

Create `src/swarms/registry.ts`:

```typescript
export interface SwarmRegistry {
  swarms: SwarmRecord[];
  lastUpdated: ISO8601;
}

export function loadSwarmRegistry(workspaceRoot: string): SwarmRegistry;
export function saveSwarmRegistry(workspaceRoot: string, registry: SwarmRegistry): void;
export function getSwarm(workspaceRoot: string, id: string): SwarmRecord | null;
export function listSwarms(workspaceRoot: string, limit?: number): SwarmRecord[];
export function createSwarmId(): string;
export function pruneSwarmRegistry(workspaceRoot: string, keepLatest?: number): void;
```

**Stored in:** `.ai/.dispath-swarms.json`

```json
{
  "swarms": [
    {
      "id": "swarm-2025-02-27-001",
      "createdAt": "2025-02-27T00:35:00Z",
      "completedAt": "2025-02-27T00:38:15Z",
      "status": "completed",
      "tasks": [
        {
          "id": "task-1",
          "agent": "dataweaver",
          "request": "Find all API endpoints",
          "status": "completed",
          "sessionId": "sess-abc123",
          "output": "Found 23 endpoints in src/api/ and src/routes/...",
          "tokens": { "input": 500, "output": 800 },
          "startedAt": "2025-02-27T00:35:01Z",
          "completedAt": "2025-02-27T00:35:30Z",
          "duration": 29000
        },
        {
          "id": "task-2",
          "agent": "blackice",
          "request": "Review security module",
          "status": "completed",
          "sessionId": "sess-def456",
          "output": "Security review passed. Found 0 critical issues...",
          "tokens": { "input": 2000, "output": 1200 },
          "startedAt": "2025-02-27T00:35:02Z",
          "completedAt": "2025-02-27T00:37:15Z",
          "duration": 133000
        }
      ],
      "options": {
        "concurrency": 5,
        "timeout": 300000,
        "worktrees": false,
        "recordOutput": "truncated"
      },
      "summary": "All tasks completed successfully. Swarm runtime: 2m 15s",
      "stats": {
        "totalTasks": 2,
        "completedTasks": 2,
        "failedTasks": 0,
        "totalTokens": { "input": 2500, "output": 2000 },
        "totalDuration": 135000
      }
    }
  ],
  "lastUpdated": "2025-02-27T00:38:15Z"
}
```

### 3. Command Parsing: `/dispath:dispatch`

**Format:**
```
/dispath:dispatch [options] task-1 agent-1 "request 1" | task-2 agent-2 "request 2" | ...
```

**With options:**
```
/dispath:dispatch --concurrency 10 --timeout 600000 --worktrees true \
  task-1 dataweaver "Find endpoints" | \
  task-2 blackice "Review auth" | \
  task-3 ghost "Implement changes"
```

**Parser implementation:**

```typescript
interface DispatchRequest {
  options: SwarmOptions;
  tasks: Array<{
    id: string;
    agent: string;
    request: string;
  }>;
}

function parseDispatchCommand(args: string): DispatchRequest {
  // 1. Extract options (--concurrency 5, --timeout 300000, --worktrees true)
  const optionsRegex = /--(\w+)\s+(\S+)/g;
  const optionMatches = [...args.matchAll(optionsRegex)];
  
  const options: Partial<SwarmOptions> = {
    concurrency: 5,
    timeout: 300000,
    worktrees: false,
    recordOutput: "truncated"
  };
  
  for (const [, key, value] of optionMatches) {
    if (key === "concurrency") options.concurrency = parseInt(value);
    if (key === "timeout") options.timeout = parseInt(value);
    if (key === "worktrees") options.worktrees = value === "true";
    if (key === "recordOutput") options.recordOutput = value as any;
  }
  
  // 2. Remove options from args, extract tasks
  let tasksStr = args.replace(optionsRegex, "").trim();
  const taskParts = tasksStr.split("|").map(t => t.trim());
  
  const tasks = [];
  for (const taskPart of taskParts) {
    // task-1 dataweaver "Find endpoints"
    const match = taskPart.match(/(\w+-\d+)\s+(\w+)\s+"([^"]+)"/);
    if (match) {
      tasks.push({
        id: match[1],
        agent: match[2],
        request: match[3]
      });
    }
  }
  
  return { options: options as SwarmOptions, tasks };
}
```

### 4. Swarm Executor

Create `src/swarms/executor.ts`:

```typescript
export class SwarmExecutor {
  private swarmRecord: SwarmRecord;
  private workspaceRoot: string;
  private onStatusChange: (task: SwarmTask) => void;
  private runningTasks: Map<string, Promise<void>> = new Map();
  
  constructor(
    swarmRecord: SwarmRecord,
    workspaceRoot: string,
    onStatusChange: (task: SwarmTask) => void
  ) {
    this.swarmRecord = swarmRecord;
    this.workspaceRoot = workspaceRoot;
    this.onStatusChange = onStatusChange;
  }
  
  async execute(): Promise<SwarmRecord> {
    const queue = [...this.swarmRecord.tasks];
    const running = new Map<string, Promise<void>>();
    
    const startTime = Date.now();
    
    while (queue.length > 0 || running.size > 0) {
      // Start new tasks up to concurrency limit
      while (queue.length > 0 && running.size < this.swarmRecord.options.concurrency) {
        const task = queue.shift()!;
        task.status = "running";
        task.startedAt = new Date().toISOString();
        this.onStatusChange(task);
        
        const promise = this.executeTask(task)
          .then(() => {
            running.delete(task.id);
          });
        
        running.set(task.id, promise);
      }
      
      // Wait for first task to complete
      if (running.size > 0) {
        await Promise.race(running.values());
      }
    }
    
    this.swarmRecord.status = "completed";
    this.swarmRecord.completedAt = new Date().toISOString();
    this.swarmRecord.stats.totalDuration = Date.now() - startTime;
    
    // Calculate stats
    this.swarmRecord.stats.completedTasks = 
      this.swarmRecord.tasks.filter(t => t.status === "completed").length;
    this.swarmRecord.stats.failedTasks = 
      this.swarmRecord.tasks.filter(t => t.status === "failed").length;
    
    return this.swarmRecord;
  }
  
  private async executeTask(task: SwarmTask): Promise<void> {
    const timeoutMs = this.swarmRecord.options.timeout;
    const startTime = Date.now();
    
    try {
      // 1. Create worktree if enabled
      if (this.swarmRecord.options.worktrees) {
        task.worktreeId = await createWorktree(this.workspaceRoot, task.id);
      }
      
      // 2. Load and configure agent
      const agent = await loadAgent(task.agent);
      if (!agent) {
        throw new Error(`Agent not found: ${task.agent}`);
      }
      
      // 3. Execute task with timeout
      const output = await Promise.race([
        agent.execute(task.request),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Task timeout")), timeoutMs)
        )
      ]);
      
      // 4. Record output (truncate to 500 chars)
      task.output = String(output).substring(0, 500);
      
      // 5. Update task status
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      task.duration = Date.now() - startTime;
      
    } catch (error) {
      const err = error as Error;
      
      if (err.message === "Task timeout") {
        task.status = "timeout";
        task.error = `Task exceeded ${timeoutMs}ms timeout`;
      } else {
        task.status = "failed";
        task.error = err.message;
      }
      
      task.completedAt = new Date().toISOString();
      task.duration = Date.now() - startTime;
    } finally {
      // 6. Cleanup worktree if needed
      if (task.worktreeId) {
        await removeWorktree(this.workspaceRoot, task.worktreeId);
      }
      
      this.onStatusChange(task);
    }
  }
}
```

### 5. Command Handler: `/dispath:dispatch`

```typescript
async function handleDispatchCommand(args: string, ctx: ExtensionContext) {
  // 1. Parse dispatch request
  const dispatchReq = parseDispatchCommand(args);
  
  // 2. Validate agents exist
  for (const task of dispatchReq.tasks) {
    const agent = await loadAgent(task.agent);
    if (!agent) {
      ctx.ui.notify(`❌ Agent not found: ${task.agent}`);
      return;
    }
  }
  
  // 3. Create swarm record
  const swarmId = createSwarmId();
  const swarmRecord: SwarmRecord = {
    id: swarmId,
    createdAt: new Date().toISOString(),
    status: "running",
    tasks: dispatchReq.tasks.map(t => ({
      id: t.id,
      agent: t.agent,
      request: t.request,
      status: "pending"
    })),
    options: dispatchReq.options,
    stats: {
      totalTasks: dispatchReq.tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      totalTokens: { input: 0, output: 0 },
      totalDuration: 0
    }
  };
  
  // 4. Show swarm starting
  ctx.ui.notify(`🐝 Swarm ${swarmId} starting...\n` +
    `   Tasks: ${dispatchReq.tasks.length}\n` +
    `   Concurrency: ${dispatchReq.options.concurrency}\n` +
    `   Timeout: ${dispatchReq.options.timeout}ms`);
  
  // 5. Execute swarm
  const executor = new SwarmExecutor(swarmRecord, workspaceRoot, (task) => {
    ctx.ui.notify(`  [${task.id}] ${task.agent}: ${task.status}`);
  });
  
  const completed = await executor.execute();
  
  // 6. Save swarm record
  const registry = loadSwarmRegistry(workspaceRoot);
  registry.swarms.push(completed);
  saveSwarmRegistry(workspaceRoot, registry);
  
  // 7. Generate summary
  const summary = generateSwarmSummary(completed);
  
  // 8. Show results
  ctx.ui.notify(`✅ Swarm completed: ${swarmId}\n${summary}`);
}
```

### 6. Swarm Status & History

```typescript
async function handleSwarmStatusCommand(id: string, ctx: ExtensionContext) {
  const registry = loadSwarmRegistry(workspaceRoot);
  const swarm = registry.swarms.find(s => s.id === id);
  
  if (!swarm) {
    ctx.ui.notify(`❌ Swarm not found: ${id}`);
    return;
  }
  
  const output = formatSwarmStatus(swarm);
  ctx.ui.notify(output);
}

async function handleSwarmHistoryCommand(ctx: ExtensionContext) {
  const registry = loadSwarmRegistry(workspaceRoot);
  const recent = registry.swarms.slice(-10);
  
  let output = "🐝 Recent Swarms:\n\n";
  for (const swarm of recent) {
    output += `- **${swarm.id}** (${swarm.status})
    Created: ${swarm.createdAt}
    Tasks: ${swarm.stats.completedTasks}/${swarm.stats.totalTasks}
    Duration: ${(swarm.stats.totalDuration / 1000).toFixed(1)}s
\n`;
  }
  
  ctx.ui.notify(output);
}
```

---

## 🔄 Detailed Implementation Steps

### Step 1: Create Swarm Module

1. Create `src/swarms/types.ts` with SwarmTask, SwarmRecord, SwarmOptions types
2. Create `src/swarms/registry.ts` with registry functions
3. Create `src/swarms/executor.ts` with SwarmExecutor class
4. Create `src/swarms/parser.ts` with parseDispatchCommand
5. Create `src/swarms/formatter.ts` with summary/status formatting
6. Create `src/swarms/index.ts` with barrel export

### Step 2: Implement Command Handler

1. Create `src/commands/dispatch.ts` - Handle `/dispath:dispatch`
2. Create `src/commands/swarm-status.ts` - Handle `/dispath:swarm-status`
3. Create `src/commands/swarm-history.ts` - Handle `/dispath:swarm-history`
4. Create `src/commands/swarm-abort.ts` - Handle `/dispath:swarm-abort`
5. Update `src/commands/index.ts`

### Step 3: Git Worktree Integration

1. Update `src/utils/git.ts` to support worktree creation/removal per task
2. Worktree path pattern: `.ai/.worktrees/<swarm-id>/<task-id>`
3. Branch pattern: `swarm/<swarm-id>/<task-id>`
4. Auto-commit uncommitted changes on cleanup

### Step 4: Update Main Handler

1. Update `src/index.ts` to route to dispatch handler
2. Add help text for swarm commands
3. Update command parsing for swarm options

### Step 5: Create UI Components

1. Add `SwarmWidget` to show real-time status
2. Add task progress tracking
3. Show task output as it arrives

### Step 6: Add Configuration

1. Support swarm settings in config:
   - `swarm.defaultConcurrency`
   - `swarm.defaultTimeout`
   - `swarm.recordOutput`
   - `swarm.retainRecords` (default 100)

---

## 📦 Files to Create

```
src/swarms/
├── types.ts              (SwarmTask, SwarmRecord, SwarmOptions)
├── registry.ts           (Registry functions)
├── executor.ts           (SwarmExecutor class)
├── parser.ts             (parseDispatchCommand)
├── formatter.ts          (Summary & status formatting)
└── index.ts              (barrel export)

src/commands/ [new files]
├── dispatch.ts           (Handle /dispath:dispatch)
├── swarm-status.ts       (Handle /dispath:swarm-status)
├── swarm-history.ts      (Handle /dispath:swarm-history)
└── swarm-abort.ts        (Handle /dispath:swarm-abort)
```

---

## 📋 Swarm Lifecycle

```
START
  ↓
/dispath:dispatch → Create SwarmRecord (running)
  ↓
Process queue with concurrency limit
  ├─ Task 1 (running)
  ├─ Task 2 (running)
  ├─ ... up to --concurrency limit
  ↓
As tasks complete:
  ├─ Task 1 (completed)
  ├─ Task 2 (failed)
  ├─ Task 3 (timeout)
  ↓
All tasks done
  ↓
Calculate stats, save to registry
  ↓
SwarmRecord (completed)
  ↓
/dispath:swarm-status <id> → Query results
  ↓
END
```

---

## ✅ Testing Checklist

- [ ] `/dispath:dispatch` parses task definitions correctly
- [ ] Task queue respects concurrency limit
- [ ] Per-task timeout enforced
- [ ] Swarm record saved to `.ai/.dispath-swarms.json`
- [ ] Task output collected and truncated
- [ ] Git worktrees created/removed correctly (if enabled)
- [ ] Swarm status queryable
- [ ] Swarm history shows recent swarms
- [ ] Token counts accurate
- [ ] Error handling for invalid agents
- [ ] Concurrent task isolation verified
- [ ] Build passes, zero warnings

---

## 📚 Documentation to Create

- `SWARM_USAGE.md` - How to use dispatch and swarm commands
- `SWARM_ARCHITECTURE.md` - Technical deep-dive on swarm execution
- `SWARM_EXAMPLES.md` - Real-world swarm dispatch examples

---

## 🎯 Deliverable

**Completion:** Phase 3 is complete when:
1. `/dispath:dispatch` fully implemented
2. Swarm registry persists and records correctly
3. Concurrency control working
4. Per-task timeout enforced
5. Git worktree isolation working (if enabled)
6. Status/history queries working
7. Build passes with zero warnings
8. All tests pass

**Next:** Phase 4 begins after Phase 3 passes all tests.
