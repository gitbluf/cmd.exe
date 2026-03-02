# Dispath: Agent Template System

## What's New

The dispath extension now supports **pre-defined agent templates** with specialized roles, models, and tools.

## Configuration

Agent templates are defined in `~/.pi/agent/extensions/dispath.json`:

```json
{
  "defaultAgents": 3,
  "agentTemplates": {
    "analyst": { ... },
    "executor": { ... },
    "researcher": { ... },
    "auditor": { ... },
    "architect": { ... }
  }
}
```

## Quick Start

### Spawn specific agents
```bash
pi
/dispath analyst executor researcher
```

### Spawn random agents
```bash
/dispath 3
```

### Spawn multiple of same type
```bash
/dispath 2 analyst
```

## What Each Agent Gets

Each spawned agent receives:

1. **Isolated Git Worktree** - Independent workspace with its own branch
2. **.agent.json** - Configuration file with:
   - Agent type/role
   - System prompt
   - Model and temperature settings
   - Available tools list
   - Mission briefing

3. **README.md** - Role description and mission details

4. **run-agent.sh** - Executable script to run the agent

5. **Git History** - Each agent can commit its own work

## Example Workflow

```bash
# Spawn 3 specialist agents
pi
/dispath analyst auditor executor Analyze code for security issues

# List agent workspaces
cd ~/.pi/agent/dispath
git worktree list

# Examine an agent's config
cd 1772145128544-0
cat .agent.json
cat README.md
ls -la

# Run the agent (when fully integrated)
./run-agent.sh

# View agent's work
git log
git show HEAD

# Clean up when done
cd ~/.pi/agent/dispath
git worktree remove -f 1772145128544-0
```

## Agent Types Summary

| Type | Role | Temp | Use Case |
|------|------|------|----------|
| **analyst** | Data Analyst | 0.3 | Pattern recognition, reports |
| **executor** | Task Executor | 0.2 | Implementation, commands |
| **researcher** | Researcher | 0.7 | Exploration, documentation |
| **auditor** | Security Auditor | 0.2 | Code review, vulnerability scan |
| **architect** | Architect | 0.5 | Design, planning, blueprints |

## Adding Custom Templates

Edit `~/.pi/agent/extensions/dispath.json`:

```json
{
  "agentTemplates": {
    "myagent": {
      "role": "Custom Role",
      "description": "What it does",
      "systemPrompt": "You are...",
      "model": "gpt-4",
      "tools": ["file_read", "file_write"],
      "maxTokens": 4096,
      "temperature": 0.5
    }
  }
}
```

Then spawn with:
```bash
/dispath myagent analyst
```

## What's Next

To enable agents to actually execute their missions:

1. **LLM Integration** - Connect to OpenAI/Claude API
2. **Tool Execution** - Implement file_read, file_write, shell_exec handlers
3. **Output Streaming** - Stream agent responses back to pi UI
4. **Persistence** - Save agent work and intermediate results

The scaffolding is ready - just needs the execution engine!
