# PHASE 4: Structured Recording & History

**Status:** Planning  
**Priority:** P2  
**Scope:** Auto-record all agent sessions and swarm operations with metadata  
**Effort:** ~2 hours  
**Depends On:** Phase 1, 2, 3 (all prior phases)

## 📋 Overview

Implement comprehensive recording of all agent activity into structured JSON registries. Every agent session, plan execution, and swarm dispatch is recorded with full metadata, output, token usage, and timing information.

Key registries:
- `.ai/.dispath-sessions.json` - Individual agent sessions
- `.ai/.dispath-plans.json` - Plan lifecycle (created in Phase 2)
- `.ai/.dispath-swarms.json` - Swarm records (created in Phase 3)

Records are pruned to keep only the most recent N entries (default 100 per registry).

---

## 🎯 Success Criteria

- [x] All agent sessions auto-recorded to `.ai/.dispath-sessions.json`
- [x] Session metadata includes: agent, request, output, tokens, duration, status
- [x] Sessions linked to plans (if from `/dispath:synth`)
- [x] Sessions linked to swarms (if from `/dispath:dispatch`)
- [x] Swarm records include all task metadata and summary
- [x] Plan records include execution history and status
- [x] Registry pruning keeps latest 100 entries per registry
- [x] `/dispath:history` command shows recent activity
- [x] All data persisted and queryable
- [x] Build passes, zero warnings

---

## 📐 Technical Specification

### 1. Session Registry

Create `src/sessions/types.ts`:

```typescript
export interface SessionRecord {
  id: string;                    // sess-abc123
  timestamp: ISO8601;
  
  // Execution context
  agentId: string;               // cortex, blueprint, ghost, etc.
  type: "plan" | "synth" | "apply" | "dispatch" | "direct";
  request: string;               // Original request/instruction
  
  // Execution result
  status: "running" | "completed" | "failed" | "timeout" | "cancelled";
  output?: string;               // First 1000 chars
  fullOutputPath?: string;       // Path to full output log
  error?: string;                // Error message if failed
  
  // Performance
  startedAt: ISO8601;
  completedAt?: ISO8601;
  duration?: number;             // milliseconds
  
  // Tokens & cost
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  
  // Relationships
  planId?: string;               // If from /dispath:synth
  swarmId?: string;              // If from /dispath:dispatch
  swarmTaskId?: string;          // If part of swarm
  
  // Metadata
  model?: string;                // Which model was used
  temperature?: number;          // Temperature setting
  tools?: string[];              // Tools available to agent
}

export interface SessionRegistry {
  sessions: SessionRecord[];
  lastUpdated: ISO8601;
  stats: {
    totalSessions: number;
    completedSessions: number;
    failedSessions: number;
    totalTokensUsed: {
      input: number;
      output: number;
      total: number;
    };
    totalDuration: number;       // milliseconds
  };
}

export function loadSessionRegistry(workspaceRoot: string): SessionRegistry;
export function saveSessionRegistry(workspaceRoot: string, registry: SessionRegistry): void;
export function getSession(workspaceRoot: string, id: string): SessionRecord | null;
export function listSessions(workspaceRoot: string, limit?: number): SessionRecord[];
export function createSessionId(): string;
export function recordSession(workspaceRoot: string, session: SessionRecord): void;
export function pruneSessionRegistry(workspaceRoot: string, keepLatest?: number): void;
```

### 2. Unified Recording

Create `src/recording/recorder.ts`:

```typescript
export class SessionRecorder {
  private workspaceRoot: string;
  private currentSession: SessionRecord | null = null;
  
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }
  
  startSession(
    agentId: string,
    type: "plan" | "synth" | "apply" | "dispatch" | "direct",
    request: string,
    context?: {
      planId?: string;
      swarmId?: string;
      swarmTaskId?: string;
      model?: string;
      temperature?: number;
      tools?: string[];
    }
  ): SessionRecord {
    this.currentSession = {
      id: createSessionId(),
      timestamp: new Date().toISOString(),
      agentId,
      type,
      request,
      status: "running",
      startedAt: new Date().toISOString(),
      ...context
    };
    
    return this.currentSession;
  }
  
  logOutput(text: string): void {
    if (!this.currentSession) return;
    
    // Keep first 1000 chars
    if (!this.currentSession.output) {
      this.currentSession.output = text.substring(0, 1000);
    } else if (this.currentSession.output.length < 1000) {
      this.currentSession.output += text.substring(0, 1000 - this.currentSession.output.length);
    }
  }
  
  completeSession(
    status: "completed" | "failed" | "timeout" | "cancelled",
    error?: string,
    tokens?: { input: number; output: number }
  ): SessionRecord {
    if (!this.currentSession) {
      throw new Error("No active session to complete");
    }
    
    this.currentSession.status = status;
    this.currentSession.completedAt = new Date().toISOString();
    this.currentSession.duration = 
      new Date(this.currentSession.completedAt).getTime() - 
      new Date(this.currentSession.startedAt).getTime();
    
    if (error) {
      this.currentSession.error = error;
    }
    
    if (tokens) {
      this.currentSession.tokens = {
        input: tokens.input,
        output: tokens.output,
        total: tokens.input + tokens.output
      };
    }
    
    // Save to registry
    recordSession(this.workspaceRoot, this.currentSession);
    
    const completed = this.currentSession;
    this.currentSession = null;
    
    return completed;
  }
  
  cancelSession(): void {
    if (this.currentSession) {
      this.completeSession("cancelled");
    }
  }
}
```

### 3. Integration Points

#### Phase 1: Agent Definitions
- Record session for each agent invocation
- Include agent metadata (model, temperature, tools)

#### Phase 2: Plan-First Workflow
- Record plan generation session
- Record synth execution session (link to plan)
- Record apply session
- Update plan registry with execution history

#### Phase 3: Swarm Orchestration
- Each task in swarm is a session
- Session linked to swarmId + swarmTaskId
- Swarm summary includes all task sessions

### 4. `/dispath:history` Command

```typescript
async function handleHistoryCommand(ctx: ExtensionContext) {
  const sessionRegistry = loadSessionRegistry(workspaceRoot);
  const planRegistry = loadPlanRegistry(workspaceRoot);
  const swarmRegistry = loadSwarmRegistry(workspaceRoot);
  
  // Get recent activity from all registries
  const recentSessions = sessionRegistry.sessions.slice(-10);
  const recentPlans = planRegistry.plans.slice(-5);
  const recentSwarms = swarmRegistry.swarms.slice(-3);
  
  let output = "📊 Recent Activity:\n\n";
  
  // Show sessions
  output += "**Sessions:**\n";
  for (const session of recentSessions) {
    output += `  • ${session.id} (${session.agentId}): ${session.status}
    ${new Date(session.timestamp).toLocaleString()}
    Duration: ${(session.duration || 0) / 1000}s
\n`;
  }
  
  // Show plans
  output += "\n**Plans:**\n";
  for (const plan of recentPlans) {
    output += `  • ${plan.id}: ${plan.status}
    Created: ${new Date(plan.createdAt).toLocaleString()}
\n`;
  }
  
  // Show swarms
  output += "\n**Swarms:**\n";
  for (const swarm of recentSwarms) {
    output += `  • ${swarm.id}: ${swarm.status}
    Tasks: ${swarm.stats.completedTasks}/${swarm.stats.totalTasks}
    Duration: ${(swarm.stats.totalDuration / 1000).toFixed(1)}s
\n`;
  }
  
  // Global stats
  output += "\n**Overall Stats:**\n";
  output += `  Sessions: ${sessionRegistry.stats.totalSessions}\n`;
  output += `  Tokens Used: ${sessionRegistry.stats.totalTokensUsed.total}\n`;
  output += `  Total Duration: ${(sessionRegistry.stats.totalDuration / 1000 / 60).toFixed(1)}m\n`;
  
  ctx.ui.notify(output);
}
```

### 5. Session Registry Format

**Stored in:** `.ai/.dispath-sessions.json`

```json
{
  "sessions": [
    {
      "id": "sess-001",
      "timestamp": "2025-02-27T00:30:00Z",
      "agentId": "blueprint",
      "type": "plan",
      "request": "Refactor auth module",
      "status": "completed",
      "output": "Generated plan with 5 steps...",
      "startedAt": "2025-02-27T00:30:00Z",
      "completedAt": "2025-02-27T00:30:15Z",
      "duration": 15000,
      "tokens": {
        "input": 500,
        "output": 1200,
        "total": 1700
      },
      "planId": "plan-abc123",
      "model": "gpt-4o",
      "temperature": 0.3,
      "tools": ["file_read", "web_search"]
    },
    {
      "id": "sess-002",
      "timestamp": "2025-02-27T00:31:00Z",
      "agentId": "ghost",
      "type": "synth",
      "request": "Execute plan plan-abc123",
      "status": "completed",
      "output": "Implemented all changes...",
      "startedAt": "2025-02-27T00:31:00Z",
      "completedAt": "2025-02-27T00:32:30Z",
      "duration": 90000,
      "tokens": {
        "input": 2000,
        "output": 3000,
        "total": 5000
      },
      "planId": "plan-abc123",
      "model": "gpt-4o",
      "temperature": 0.3,
      "tools": ["file_read", "file_write", "file_edit", "shell_exec"]
    }
  ],
  "lastUpdated": "2025-02-27T00:32:30Z",
  "stats": {
    "totalSessions": 2,
    "completedSessions": 2,
    "failedSessions": 0,
    "totalTokensUsed": {
      "input": 2500,
      "output": 4200,
      "total": 6700
    },
    "totalDuration": 105000
  }
}
```

### 6. Plan Execution History

Extend plan registry to track executions:

```typescript
export interface PlanMetadata {
  // ... existing fields
  
  // NEW: Execution history
  executions: Array<{
    sessionId: string;
    type: "synth" | "apply";
    executedAt: ISO8601;
    status: "completed" | "failed";
    duration: number;
    error?: string;
  }>;
}
```

**Updated plan record:**
```json
{
  "id": "plan-abc123",
  "title": "Auth Refactor",
  "status": "completed",
  "createdAt": "2025-02-27T00:30:00Z",
  "executions": [
    {
      "sessionId": "sess-002",
      "type": "synth",
      "executedAt": "2025-02-27T00:31:00Z",
      "status": "completed",
      "duration": 90000
    }
  ]
}
```

### 7. Session Linking

All three registries linked together:

```
SessionRecord (sess-001: blueprint plan generation)
  ↓
PlanRecord (plan-abc123: created from sess-001)
  ↓
SessionRecord (sess-002: ghost synth execution)
  ↓
PlanRecord.executions: [{ sessionId: sess-002 }]

---

SessionRecord (sess-100: swarm task)
  ↓ swarmId: swarm-001, swarmTaskId: task-1
SwarmRecord (swarm-001: contains task-1)
  ↓
SwarmRecord.tasks[0].sessionId: sess-100
```

---

## 🔄 Detailed Implementation Steps

### Step 1: Create Recording Module

1. Create `src/sessions/types.ts` with SessionRecord and SessionRegistry types
2. Create `src/sessions/registry.ts` with registry functions
3. Create `src/recording/recorder.ts` with SessionRecorder class
4. Create `src/recording/index.ts` with barrel export

### Step 2: Integrate with Agent Executor

1. Update `src/agents/executor.ts` to use SessionRecorder
2. Record session start/completion with metadata
3. Capture output and token usage
4. Link sessions to plans/swarms

### Step 3: Update Phase 2 (Plan Workflow)

1. Update plan generation to record session
2. Link plan to creation session (planId)
3. Update plan execution to record session
4. Link plan to execution sessions

### Step 4: Update Phase 3 (Swarm Orchestration)

1. Update swarm task execution to create sessions
2. Link each task session to swarmId + swarmTaskId
3. Update session registry with swarm metadata

### Step 5: Add History Command

1. Create `src/commands/history.ts` - Handle `/dispath:history`
2. Aggregate data from all registries
3. Show recent activity and stats
4. Update `src/commands/index.ts`

### Step 6: Registry Pruning

1. Add pruning logic to recorder
2. Keep latest 100 entries per registry
3. Run pruning after each save
4. Log when records are pruned

### Step 7: Configuration

1. Support registry settings in config:
   - `recording.enabled` (default true)
   - `recording.maxRecords` (default 100)
   - `recording.storePath` (default `.ai/`)
   - `recording.truncateOutput` (default 1000)

---

## 📦 Files to Create

```
src/sessions/
├── types.ts              (SessionRecord, SessionRegistry)
└── registry.ts           (Registry functions)

src/recording/
├── recorder.ts           (SessionRecorder class)
└── index.ts              (barrel export)

src/commands/
└── history.ts            (Handle /dispath:history)
```

---

## 📋 Registry Files (Created/Updated)

```
.ai/
├── .dispath-sessions.json  (NEW: All individual sessions)
├── .dispath-plans.json     (UPDATED: Add executions array)
└── .dispath-swarms.json    (UPDATED: Link to sessions)
```

---

## 🔗 Data Relationships

```
Agent Execution Flow:
  ↓
SessionRecorder.startSession()
  ↓
Agent processes request
  ↓
SessionRecorder.logOutput()
  ↓
Agent completes
  ↓
SessionRecorder.completeSession()
  ↓
Registry saved to `.ai/.dispath-sessions.json`
  ↓
SessionRecord linked to Plan/Swarm if applicable

Plan Execution Flow:
  ↓
Create plan (session A) → PlanRecord created
  ↓
Execute plan (session B) → SessionRecord linked to PlanRecord
  ↓
PlanRecord.executions[]: [sessionB]

Swarm Dispatch Flow:
  ↓
Create swarm → SwarmRecord created
  ↓
Task 1 (session X) → linked via swarmId + swarmTaskId
  ↓
Task 2 (session Y) → linked via swarmId + swarmTaskId
  ↓
SwarmRecord.tasks[].sessionId: [X, Y]
```

---

## ✅ Testing Checklist

- [ ] Sessions auto-recorded to `.ai/.dispath-sessions.json`
- [ ] Session metadata complete (status, duration, tokens)
- [ ] Sessions linked to plans correctly
- [ ] Sessions linked to swarms correctly
- [ ] `/dispath:history` shows recent activity
- [ ] Registry pruning keeps latest 100 entries
- [ ] Stats calculated correctly across all registries
- [ ] Plan execution history updated
- [ ] Swarm task sessions created and linked
- [ ] Token usage accumulated correctly
- [ ] All timestamps in ISO8601 format
- [ ] Build passes, zero warnings

---

## 📚 Documentation to Create

- `RECORDING_GUIDE.md` - How recording works and what's recorded
- `REGISTRY_FORMAT.md` - Format specification for all registry files
- `HISTORY_QUERIES.md` - How to query history data

---

## 🎯 Deliverable

**Completion:** Phase 4 is complete when:
1. All sessions auto-recorded with metadata
2. Session registries persist correctly
3. Plan execution history tracked
4. Swarm task sessions linked
5. `/dispath:history` working
6. Registry pruning working (keep latest 100)
7. All data properly aggregated
8. Build passes with zero warnings
9. All tests pass

**Status:** ✅ All phases planned and ready for implementation
