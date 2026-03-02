# Phase 3: Swarm Orchestration - Complete Reference

## 🐝 What's New (Phase 3)

**3 New Commands** implementing Neurogrid-style swarm orchestration:
1. `/dispatch:dispatch` - Spawn concurrent multi-agent swarms
2. `/dispatch:swarm-status` - Query swarm execution results
3. `/dispatch:swarm-history` - List recent swarm executions

## 🎯 Core Concept

**Swarms** allow you to execute multiple agents in **parallel** with configurable **concurrency control**, **per-task timeouts**, and **automatic result recording**.

```
Before (Sequential):
  Task 1 (30s) → Task 2 (30s) → Task 3 (30s) = 90s total

After (Swarm with concurrency=3):
  Task 1, 2, 3 run in parallel = 30s total
```

## 📋 Command Reference

### `/dispatch:dispatch [options] task-1 agent "request" | task-2 agent "request"`

Execute multiple agents concurrently.

**Format:**
```
/dispatch:dispatch [--option value] task-N agent "request" | task-N agent "request" | ...
```

**Options:**
```
--concurrency N      Max parallel tasks (1-20, default 5)
--timeout N          Per-task timeout in ms (default 300000 = 5 min)
--worktrees true     Enable git worktree isolation (experimental)
--recordOutput X     Output recording: none/truncated/full (default truncated)
--retryFailed true   Retry failed tasks (default false)
```

**Examples:**

Basic swarm (default options):
```bash
/dispatch:dispatch task-1 dataweaver "Find API endpoints" | task-2 blackice "Review security"
```

Parallel processing (fast):
```bash
/dispatch:dispatch --concurrency 10 task-1 dataweaver "Scan A" | task-2 dataweaver "Scan B" | task-3 dataweaver "Scan C"
```

Sequential processing (--concurrency 1):
```bash
/dispatch:dispatch --concurrency 1 task-1 cortex "Plan" | task-2 ghost "Implement"
```

Custom timeout (2 minutes):
```bash
/dispatch:dispatch --timeout 120000 task-1 ghost "Quick edit"
```

Full output recording:
```bash
/dispatch:dispatch --recordOutput full task-1 ghost "Implement changes"
```

### `/dispatch:swarm-status <swarm-id>`

View detailed results of a completed swarm.

**Usage:**
```bash
/dispatch:swarm-status swarm-20250227-abc123
```

**Output:**
```
🐝 Swarm Status: swarm-20250227-abc123

Status: COMPLETED
Created: 2025-02-27T10:35:00Z
Completed: 2025-02-27T10:37:45Z

Tasks:

✅ task-1 | dataweaver | Find endpoints...
   Duration: 45.0s
   Output: Found 23 endpoints in src/api/...

✅ task-2 | blackice | Review security...
   Duration: 125.0s
   Output: Security review passed...

Stats:
  Total Tasks: 2
  Completed: 2
  Failed: 0
  Concurrency: 5
  Timeout: 300.0s
  Total Duration: 165.0s
```

### `/dispatch:swarm-history`

List the last 10 swarms.

**Usage:**
```bash
/dispatch:swarm-history
```

**Output:**
```
🐝 Recent Swarms:

✅ swarm-20250227-abc123 | completed
   Created: 2/27/2025, 10:35 AM
   Tasks: 2/2
   Duration: 2.8s

✅ swarm-20250227-def456 | completed
   Created: 2/27/2025, 10:20 AM
   Tasks: 5/5
   Duration: 45.3s

🔄 swarm-20250227-ghi789 | running
   Created: 2/27/2025, 10:10 AM
   Tasks: 3/7
   Duration: 2.1s (in progress)
```

## 📊 Swarm Execution Flow

```
User Input:
  /dispatch:dispatch --concurrency 3 task-1 cortex "Plan" | task-2 ghost "Code" | task-3 dataweaver "Analyze"
        ↓
Parse Command:
  • Extract options (concurrency, timeout, etc.)
  • Parse task definitions (ID, agent, request)
        ↓
Validate:
  • Check agents exist
  • Check no duplicate task IDs
  • Validate option values
        ↓
Create SwarmRecord:
  • Unique swarm ID (swarm-20250227-xyz123)
  • Task list (all status=pending)
  • Options snapshot
  • Empty stats
        ↓
Execute SwarmExecutor:
  ┌─ While tasks remain or running:
  │  ├─ Start up to N parallel tasks
  │  ├─ Task 1: cortex "Plan" (running)
  │  ├─ Task 2: ghost "Code" (running)
  │  ├─ Task 3: dataweaver "Analyze" (queued - waiting for slot)
  │  ├─ Task 1 completes (30s) → Task 3 starts
  │  ├─ Task 2 completes (60s)
  │  ├─ Task 3 completes (45s)
  │  └─ All done in ~60s (max individual task duration)
  └─ Update final stats
        ↓
Record SwarmRecord:
  • Save to .ai/.dispath-swarms.json
  • All task results
  • Final status & timestamps
        ↓
Display Summary:
  ✓ 3/3 tasks completed
  Total duration: 60.3s
  Token usage: 3500 in, 2800 out
        ↓
Query Results:
  /dispatch:swarm-status swarm-20250227-xyz123
```

## 🔀 Concurrency Control

**Default:** `--concurrency 5`

### Sequential Execution (concurrency 1)
```
Time: 0-30s   [Task 1 running]
Time: 30-60s  [Task 2 running]
Time: 60-90s  [Task 3 running]
Total: 90 seconds
```

### Parallel Execution (concurrency 3)
```
Time: 0-30s   [Task 1] [Task 2] [Task 3 running]
Total: 30 seconds (max individual time)
```

### Optimal Concurrency (concurrency 5)
```
Time: 0-30s   [Task 1] [Task 2] [Task 3] [Task 4] [Task 5 running]
Time: 30-60s  [Task 6] [Task 7] [Task 8] running...
Time: ...continues...
Total: scales with task count
```

## 📁 Swarm Registry

**Location:** `~/.pi/agent/dispatch/.ai/.dispath-swarms.json`

**Format:**
```json
{
  "swarms": [
    {
      "id": "swarm-20250227-abc123",
      "createdAt": "2025-02-27T10:35:00.000Z",
      "completedAt": "2025-02-27T10:37:45.123Z",
      "status": "completed",
      "tasks": [
        {
          "id": "task-1",
          "agent": "dataweaver",
          "request": "Find all API endpoints",
          "status": "completed",
          "output": "Found 23 endpoints in src/api/...",
          "startedAt": "2025-02-27T10:35:00.000Z",
          "completedAt": "2025-02-27T10:35:45.100Z",
          "duration": 45100
        },
        {
          "id": "task-2",
          "agent": "blackice",
          "request": "Review security module",
          "status": "completed",
          "output": "Security review passed...",
          "startedAt": "2025-02-27T10:35:10.000Z",
          "completedAt": "2025-02-27T10:37:15.200Z",
          "duration": 125200
        }
      ],
      "options": {
        "concurrency": 5,
        "timeout": 300000,
        "worktrees": false,
        "recordOutput": "truncated",
        "retryFailed": false
      },
      "summary": "All 2/2 tasks completed successfully",
      "stats": {
        "totalTasks": 2,
        "completedTasks": 2,
        "failedTasks": 0,
        "totalTokens": {
          "input": 2500,
          "output": 2000
        },
        "totalDuration": 165300
      }
    }
  ],
  "lastUpdated": "2025-02-27T10:37:45.123Z"
}
```

## 🔄 Task Lifecycle

Each task goes through these states:

```
pending      → running      → completed/failed/timeout
  ↓            ↓              ↓
queued       executing      done (with results)
```

**Task Status Values:**
- `pending` - Waiting in queue
- `running` - Currently executing
- `completed` - Finished successfully
- `failed` - Execution error
- `timeout` - Exceeded timeout limit
- `cancelled` - Swarm was aborted

## ⏱️ Timeout Behavior

**Default:** 300,000ms (5 minutes per task)

```bash
# 2-minute timeout
/dispatch:dispatch --timeout 120000 task-1 cortex "Long operation"
```

If task exceeds timeout:
- Status changes to `timeout`
- Error message: "Task exceeded Nms timeout"
- Swarm continues with other tasks
- Task marked in final results

## 📝 Output Recording

**Options:**
- `none` - Don't record output (fast, minimal storage)
- `truncated` - First 500 characters (default, balanced)
- `full` - Complete output (storage intensive)

```bash
# Minimal overhead
/dispatch:dispatch --recordOutput none task-1 cortex "Quick scan"

# Balanced (default)
/dispatch:dispatch task-1 cortex "Standard task"

# Full recording
/dispatch:dispatch --recordOutput full task-1 ghost "Complex implementation"
```

## 🧭 Common Workflows

### Workflow 1: Parallel Analysis
```bash
# Run 5 different analyses in parallel
/dispatch:dispatch \
  task-1 dataweaver "Find all database schemas" | \
  task-2 dataweaver "Find all API routes" | \
  task-3 blackice "Identify security issues" | \
  task-4 cortex "List dependencies" | \
  task-5 ghost "Count lines of code"

# Check results
/dispatch:swarm-history
/dispatch:swarm-status swarm-20250227-xyz
```

### Workflow 2: Staged Processing
```bash
# Stage 1: Parallel reconnaissance
/dispatch:dispatch --concurrency 5 \
  task-1 dataweaver "Scan frontend" | \
  task-2 dataweaver "Scan backend" | \
  task-3 dataweaver "Scan database"

# Stage 2: Sequential implementation (--concurrency 1)
/dispatch:dispatch --concurrency 1 \
  task-1 cortex "Plan changes" | \
  task-2 ghost "Implement frontend" | \
  task-3 ghost "Implement backend"
```

### Workflow 3: Quick Parallel Checks
```bash
# High concurrency, short timeout for quick checks
/dispatch:dispatch --concurrency 20 --timeout 30000 \
  task-1 blackice "Check file1.ts" | \
  task-2 blackice "Check file2.ts" | \
  task-3 blackice "Check file3.ts" | \
  task-4 blackice "Check file4.ts" | \
  task-5 blackice "Check file5.ts"
```

## 📊 Performance Tips

1. **Use concurrency wisely**
   - Sequential (--concurrency 1) if tasks depend on each other
   - Parallel (--concurrency 5-10) for independent analysis tasks
   - High concurrency (--concurrency 20) for quick checks

2. **Set appropriate timeouts**
   - Quick scans: --timeout 30000 (30s)
   - Normal tasks: --timeout 300000 (5 min) [default]
   - Long operations: --timeout 600000 (10 min)

3. **Choose output recording**
   - Quick checks: --recordOutput none (save storage)
   - Standard: --recordOutput truncated (default)
   - Critical: --recordOutput full (never lose data)

## 🧪 Testing Examples

Test basic swarm:
```bash
/dispatch:dispatch task-1 cortex "Test 1" | task-2 cortex "Test 2"
```

Test concurrency limiting:
```bash
/dispatch:dispatch --concurrency 1 \
  task-1 cortex "First" | \
  task-2 cortex "Second" | \
  task-3 cortex "Third"
```

Test timeout:
```bash
/dispatch:dispatch --timeout 10000 task-1 cortex "Long operation"
```

View results:
```bash
/dispatch:swarm-history
/dispatch:swarm-status swarm-20250227-xyz123
```

## 🔍 Understanding Output

**Real-time during execution:**
```
🐝 [SWARM] swarm-20250227-xyz123 starting

   Tasks: 3
   Concurrency: 5
   Timeout: 300.0s

   ⏳ task-1     [cortex] Identify requirements
   ⏳ task-2     [ghost] Write implementation
   ⏳ task-3     [blackice] Review code

   ✅ task-1     completed
   🔄 task-2     running
   🔄 task-3     running
   ✅ task-2     completed
   ✅ task-3     completed

🐝 Swarm: swarm-20250227-xyz123
Status: completed

📊 Results:
✅ task-1 [cortex]: completed (15.2s)
   Requirements identified clearly...
✅ task-2 [ghost]: completed (45.8s)
   Implementation complete...
✅ task-3 [blackice]: completed (22.3s)
   Code review passed, 0 issues...

Summary: 3/3 tasks completed
Duration: 45.8s
```

## 🎓 Integration with Other Phases

**Complete Workflow Using All Phases:**

```bash
# Phase 2: Create a plan
/dispatch:plan "Refactor authentication system"

# View the plan
/dispatch:plans

# Phase 3: While waiting, run parallel analysis
/dispatch:dispatch \
  task-1 dataweaver "Find auth-related code" | \
  task-2 blackice "Review auth security"

# Check swarm results
/dispatch:swarm-status swarm-20250227-xyz

# Phase 2: Execute the plan
/dispatch:synth plan-abc123

# Phase 1: Test with single agents
/dispatch 2 cortex "Validate changes"

# Phase 3: Final verification swarm
/dispatch:dispatch --concurrency 3 \
  task-1 blackice "Final security review" | \
  task-2 ghost "Run tests" | \
  task-3 hardline "Build check"

# View all work done
/dispatch:swarm-history
```

## 💾 Data Storage

**Swarm data stored in:**
- `.ai/.dispath-swarms.json` - Registry (all swarm metadata)
- `.ai/plan-*.md` - Plans from Phase 2 (separate)
- `.tmp-swarm-*` - Temporary task workspaces (auto-cleaned)

**Persists across:**
- Pi restarts
- Machine reboots
- Extension reloads

**Can be version controlled:**
```bash
git add .ai/.dispath-swarms.json
git add .ai/plan-*.md
# (exclude .tmp-* from version control)
```

## 📈 Monitoring & Debugging

View swarm in progress:
```bash
/dispatch:swarm-history
# Find the one with "running" status
```

Check specific swarm:
```bash
/dispatch:swarm-status swarm-20250227-xyz123
```

Understand why a task failed:
```bash
/dispatch:swarm-status swarm-20250227-xyz123
# Look for error message in failed task output
```

---

**Status:** ✅ Production Ready  
**Build:** 23 KB compiled  
**Commands:** 3 new (11 total in dispatch extension)  
**Next Phase:** Phase 4 - Structured Recording System
