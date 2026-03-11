# Swarm Agent System

## Core Commands

### /swarm <task-spec>

Dispatch agents to work on tasks concurrently.

**Usage:**

```bash
/swarm task-1 ghost "implement auth" | task-2 blueprint "review design"
/swarm --concurrency 3 task-1 ghost "do X" | task-2 cortex "do Y"
```

**Options:**

- `--concurrency N` - Max parallel tasks (1-20, default 5)
- `--timeout N` - Per-task timeout in ms (default 300000)
- `--worktrees` - Enable git worktree isolation (true/false)
- `--recordOutput` - Output recording: none, truncated, or full
- `--retryFailed` - Retry failed tasks (true/false)

### /mode

Toggle between Plan mode (read-only analysis) and Build mode (full implementation).

**Plan Mode:**
- Read-only tools: `read`, `find_files`
- Focuses on analysis, architecture, and planning
- Creates structured plans with numbered steps
- Suggests switching to Build mode for execution

**Build Mode:**
- Full tools: `read`, `write`, `edit`, `bash`, `find_files`
- Executes changes surgically and precisely
- If a plan is active, receives it in the system prompt
- Marks steps complete with `[DONE:n]` tags

### /todos

Show current plan progress. Displays an expanded view of all plan steps with completion status.

**Usage:**

```bash
/todos   # Show plan progress (auto-dismisses after 5 seconds)
```

Plan progress is also always visible in the footer status bar when a plan is active.

### /swarm:list

List all available agent templates with their roles, temperatures, and models.

### /swarm:status [swarm-id]

View swarm execution status and history.

- Without args: shows recent history
- With swarm-id: shows detailed status for that swarm

### /swarm:dashboard

Interactive monitoring dashboard with real-time swarm status, task details, and output.

### /swarm:task [task-id]

View detailed information about a specific task in a swarm.

### /synth:plan [focus-area]

Synthesize a comprehensive implementation plan using the BLUEPRINT agent.

**Usage:**

```bash
/synth:plan focus on the auth module
/synth:plan
```

**Features:**
- Generates structured markdown plan
- Saves to `.agents/plan-{timestamp}.md`
- Automatically parses and activates the plan
- Shows progress in footer status bar
- Use `/todos` to view, `/mode` to execute

**Plan includes:**
1. Clear Summary
2. Defined Goals
3. Files to Change/Create
4. Sequenced Implementation Steps
5. Risks & Mitigation
6. Acceptance Criteria

### /synth:exec [mission]

Execute a plan or mission using the GHOST agent.

**Usage:**

```bash
/synth:exec
/synth:exec implement the authentication module
```

## Plan Mode & Plan Tracking

### How Plans Work

Plans are structured, numbered sequences of implementation steps. The system supports two ways to create plans:

1. **Conversation Plans** - When in Plan mode, if the agent outputs a "Plan:" header followed by numbered steps, it's automatically detected and activated
2. **Synthesized Plans** - Using `/synth:plan` to generate a comprehensive plan via the BLUEPRINT agent

### Plan Lifecycle

```
Create Plan → Activate → Execute Steps → Track Progress → Complete
```

**1. Create**
- In Plan mode: Ask agent to create a plan
- Or use `/synth:plan [focus-area]`
- Plan is parsed and stored

**2. Activate**
- Plan becomes "active" and persists across sessions
- Footer shows progress: `📋 [3/7] ━━━━━░░░ 43% — "Current step"`
- Use `/todos` to view full plan

**3. Execute**
- Switch to Build mode with `/mode`
- Agent receives plan in system prompt
- Work through steps in order

**4. Track**
- Agent marks steps complete with `[DONE:n]` tags
- Flash notification shows completion
- Footer updates in real-time
- State saves to `.agents/.plan-state.json`

**5. Complete**
- All steps marked done
- Footer shows 100%
- Plan remains in history

### Example Workflow

```bash
# 1. Create a plan
User: /synth:plan focus on refactoring the API layer

# System responds:
→ Plan saved to .agents/plan-20260311-143000.md
→ Plan activated with 7 steps
→ 📋 [0/7] ░░░░░░░░ 0% — "Audit current API structure"

# 2. View plan details
User: /todos

# 3. Start execution
User: /mode
User: Let's start with step 1

Agent: I'll audit the API structure... [DONE:1]
→ ✅ Step 1 complete — "Audit current API structure" [1/7]
→ 📋 [1/7] ━░░░░░░░ 14% — "Identify common patterns"

# 4. Continue through steps
Agent: Now identifying patterns... [DONE:2]
...

# 5. Session resume (later)
User: pi --resume
→ Plan restored from .agents/.plan-state.json
→ 📋 [3/7] ━━━━━░░░ 43% — "Design abstraction layer"
```

### Plan State Persistence

Plans survive session restarts. State is saved to:
- **Location:** `.agents/.plan-state.json`
- **Auto-saved:** After every step completion
- **Auto-loaded:** On session start

### Conversation Plan Detection

When in Plan mode, the system auto-detects plans in agent responses:

**Detected formats:**
```
Plan:
1. First step
2. Second step
3. Third step
```

**Requirements:**
- Must have "Plan:" header (case-insensitive)
- Minimum 2 numbered steps
- Only when no existing plan (prevents false positives)

### `[DONE:n]` Markers

In Build mode with an active plan, the agent marks completed steps:

```
Agent: I've implemented the auth service... [DONE:4]
```

**Features:**
- Automatic detection on every turn
- Updates plan state immediately
- Shows flash notification
- Updates footer status
- Persists to disk

### Plan Progress Widget

**3-State Display System:**

1. **Compact Footer (Always Visible)**
   ```
   📋 [3/7] ━━━━━░░░ 43% — "Implement auth service"
   ```
   - Zero screen space
   - Real-time updates
   - Shows current step

2. **Expanded View (On-Demand)**
   ```
   ─────────────────────────────────────
    📋 Plan Progress [3/7]
   ─────────────────────────────────────
    ✅ 1. Analyze auth module
    ✅ 2. Identify dependencies
    ✅ 3. Create interface definitions
    ⬜ 4. Implement auth service        ← current
    ⬜ 5. Add tests
    ⬜ 6. Update routes
    ⬜ 7. Documentation
   ─────────────────────────────────────
   ```
   - Triggered by `/todos`
   - Auto-dismisses after 5 seconds
   - Full step details

3. **Step Completion Flash**
   ```
   ✅ Step 4 complete — "Implement auth service" [4/7]
   ```
   - 2-second notification
   - Immediate feedback
   - Then back to footer

## Built-in Agent Templates

### ghost

- **Role:** Implementation Specialist
- **Focus:** Code changes, execution, delivery
- **Prompt:** Surgical, precise, implementation-focused
- **Tools:** read, write, edit, bash
- **Temperature:** 0.1 (deterministic)

### blueprint

- **Role:** System Architect
- **Focus:** Design, planning, refactoring strategy
- **Prompt:** Big-picture thinking, design patterns
- **Tools:** read, write
- **Temperature:** 0.5 (balanced)

### cortex

- **Role:** Data Analyst
- **Focus:** Pattern recognition, insights, analysis
- **Prompt:** Analytical, data-driven, precise
- **Tools:** read, bash
- **Temperature:** 0.3 (deterministic)

### dataweaver

- **Role:** Information Researcher
- **Focus:** Documentation, exploration, findings
- **Prompt:** Thorough, curious, detail-oriented
- **Tools:** read, bash (read-only with command allowlist)
- **Temperature:** 0.4 (balanced)

### hardline

- **Role:** Security Auditor
- **Focus:** Code review, vulnerability detection
- **Prompt:** Critical, thorough, security-minded
- **Tools:** read, bash
- **Temperature:** 0.2 (strict)

### blackice

- **Role:** Orchestrator
- **Focus:** Request routing, task decomposition
- **Prompt:** Strategic, decomposition-focused
- **Tools:** coordination only
- **Temperature:** 0.4 (balanced)

## Swarm Record Structure

Each swarm creates a persistent record:

```json
{
  "id": "swarm-abc123",
  "createdAt": "2025-02-26T23:45:00Z",
  "status": "running|completed|failed|cancelled",
  "completedAt": "2025-02-27T00:15:00Z",
  "tasks": [
    {
      "id": "task-1",
      "agent": "ghost",
      "request": "implement auth module",
      "status": "completed",
      "output": "...",
      "fullOutputPath": "path/to/output.log",
      "duration": 12345,
      "tokens": { "input": 1000, "output": 2000 }
    }
  ],
  "options": {
    "concurrency": 5,
    "timeout": 300000,
    "worktrees": false,
    "recordOutput": "truncated"
  },
  "stats": {
    "totalTasks": 2,
    "completedTasks": 2,
    "failedTasks": 0,
    "totalTokens": { "input": 5000, "output": 10000 },
    "totalDuration": 25000
  }
}
```

## Examples

### Simple dispatch

```bash
/swarm task-1 ghost "implement login form"
```

### Multi-task dispatch

```bash
/swarm task-1 ghost "implement auth" | task-2 blueprint "design DB schema" | task-3 cortex "analyze security"
```

### With options

```bash
/swarm --concurrency 2 --timeout 600000 task-1 ghost "X" | task-2 blueprint "Y"
```

### Monitor swarms

```bash
/swarm:dashboard        # Interactive dashboard
/swarm:status           # Recent history
/swarm:status swarm-123 # Detailed view
```

## BLACKICE Orchestrator

For complex task decomposition, use the BLACKICE orchestrator:

```bash
/blackice decompose this API refactor into specialized subtasks
```

BLACKICE analyzes your request and routes work to specialist agents automatically.

## Next Steps

The swarm system is designed for:

- ✅ Concurrent multi-agent task execution
- ✅ Persistent state and monitoring
- ✅ Flexible agent roles and capabilities
- 🔄 (Future) Git worktree isolation
- 🔄 (Future) Advanced retry strategies
