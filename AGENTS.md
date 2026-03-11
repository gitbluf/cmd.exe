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
- **Tools:** read, bash
- **Temperature:** 0.7 (creative)

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
