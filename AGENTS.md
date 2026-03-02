# Dispath Agent Templates

## Overview

Dispath can spawn agents with **pre-defined roles, prompts, models, and tools**. Each agent is a specialized cyberpunk netrunner with its own expertise.

## Built-in Agent Types

### analyst
- **Role:** Data Analyst
- **Focus:** Pattern recognition, insights, reports
- **Prompt:** Analytical, data-driven, precise
- **Tools:** file_read, file_write, shell_exec
- **Temperature:** 0.3 (deterministic)

### executor
- **Role:** Task Executor  
- **Focus:** Implementation, command execution, delivery
- **Prompt:** Efficient, methodical, resource-aware
- **Tools:** shell_exec, file_write, git_commit
- **Temperature:** 0.2 (very focused)

### researcher
- **Role:** Information Researcher
- **Focus:** Exploration, documentation, comprehensive findings
- **Prompt:** Thorough, curious, detail-oriented
- **Tools:** file_read, web_search, file_write
- **Temperature:** 0.7 (creative)

### auditor
- **Role:** Security Auditor
- **Focus:** Code review, vulnerability detection, validation
- **Prompt:** Critical, thorough, security-minded
- **Tools:** file_read, shell_exec, file_write
- **Temperature:** 0.2 (strict)

### architect
- **Role:** System Architect
- **Focus:** Design, planning, blueprints
- **Prompt:** Big-picture thinking, long-term strategy
- **Tools:** file_write, file_read
- **Temperature:** 0.5 (balanced)

## Usage Examples

### Spawn specific agent types
```bash
/dispath analyst executor researcher
```
This spawns 3 agents: one analyst, one executor, one researcher.

### Spawn N agents of same type
```bash
/dispath 2 analyst
```
Spawns 2 analyst agents.

### Spawn N random agents
```bash
/dispath 3
```
Spawns 3 agents with random types from available templates.

### With mission briefing
```bash
/dispath analyst executor auditor Review codebase for security issues
```

### Interactive mode
```bash
/dispath
```
You'll be prompted for count and mission.

## Agent Configuration

Each agent workspace contains `.agent.json` with its configuration:

```json
{
  "id": "1772145128544-0",
  "type": "analyst",
  "template": {
    "role": "Data Analyst",
    "systemPrompt": "...",
    "model": "gpt-4",
    "tools": ["file_read", "file_write", "shell_exec"],
    "maxTokens": 4096,
    "temperature": 0.3
  },
  "mission": "Infiltrate the monolith...",
  "createdAt": "2025-02-26T23:45:00Z"
}
```

## Customizing Templates

Edit `~/.pi/agent/extensions/dispath.json`:

```json
{
  "agentTemplates": {
    "custom": {
      "role": "Custom Role",
      "description": "What this agent does",
      "systemPrompt": "You are a custom agent...",
      "model": "gpt-4",
      "tools": ["file_read", "file_write"],
      "maxTokens": 4096,
      "temperature": 0.5
    }
  }
}
```

Then use:
```bash
/dispath custom analyst executor
```

## Accessing Agent Workspaces

Each agent runs in an isolated git worktree:

```bash
# List all agent workspaces
cd ~/.pi/agent/dispath
git worktree list

# Enter an agent's workspace
cd ~/.pi/agent/dispath/1772145128544-0
cat .agent.json        # See agent config
cat README.md          # See mission details
git log                # See agent's commits

# Clean up when done
cd ~/.pi/agent/dispath
git worktree remove -f 1772145128544-0
```

## Agent Tools

Each template specifies which tools the agent can use:

- **file_read** - Read file contents
- **file_write** - Write/create files
- **shell_exec** - Execute shell commands
- **git_commit** - Create git commits
- **web_search** - Search the web

## Next: Make Agents Actually Run

Currently agents are created with config but don't automatically execute their prompts. To implement actual execution:

1. Each agent could run a `run.sh` script in its workspace
2. The script could invoke `pi` in agent mode with the systemPrompt
3. Or spawn a custom executor that reads `.agent.json` and runs the agent

Would you like me to implement that?
