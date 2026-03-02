# Dispath: Multi-Agent AI Framework

A cyberpunk-themed **multi-agent orchestration system** for the pi coding agent that lets you spawn specialized AI agents with predefined roles, tools, and models.

## Quick Start

```bash
pi
/dispath analyst executor researcher Analyze and fix security issues
```

This spawns 3 agents (analyst, executor, researcher) to work on your mission.

## What It Does

1. **Spawns Agents** - Creates isolated AI agents with specialized roles
2. **Manages Workspaces** - Each agent gets its own git worktree + config
3. **Executes Missions** - Sends custom prompts with tool access
4. **Streams Output** - Real-time feedback as agents work
5. **Saves Results** - Agent configs and execution state persisted

## Agent Types

| Type | Role | Creativity | Best For |
|------|------|-----------|----------|
| **analyst** | Data Analyst | Low (0.3) | Pattern recognition, analysis |
| **executor** | Task Executor | Very Low (0.2) | Implementation, automation |
| **researcher** | Information Researcher | High (0.7) | Exploration, documentation |
| **auditor** | Security Auditor | Very Low (0.2) | Code review, vulnerabilities |
| **architect** | System Architect | Medium (0.5) | Design, planning, blueprints |

## Usage Patterns

```bash
# Random agents
/dispath 3

# Specific agents
/dispath analyst executor researcher

# Multiple of same type
/dispath 2 analyst

# With mission
/dispath auditor Review codebase for security issues
```

## How It Works

Each agent:
1. Gets its own **isolated git worktree** (separate workspace)
2. Receives a **custom system prompt** (from template)
3. Is assigned **specific tools** (file read/write, bash, etc.)
4. Gets sent a **mission prompt** (your briefing)
5. **Executes asynchronously** (all agents run in parallel)
6. **Streams output** in real-time
7. **Saves state** for later review

## Viewing Results

```bash
# List agent workspaces
cd ~/.pi/agent/dispath
git worktree list

# Enter an agent's workspace
cd ~/.pi/agent/dispath/1772145128544-0
cat .agent.json         # See config
cat .agent-state.json   # See execution results
git log                 # See what agent committed
ls -la                  # See what agent created
```

## Customization

Edit `~/.pi/agent/extensions/dispath.json` to:
- Modify agent templates
- Add custom agent types
- Change system prompts
- Select different models
- Configure tools

Example custom agent:

```json
{
  "agentTemplates": {
    "myagent": {
      "role": "My Custom Role",
      "systemPrompt": "You are...",
      "model": "gpt-4",
      "tools": ["file_read", "file_write"],
      "temperature": 0.5
    }
  }
}
```

Then use: `/dispath myagent`

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Quick reference guide
- **[AGENTS.md](AGENTS.md)** - Agent types and templates
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical architecture
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Implementation details

## Tech Stack

- **pi SDK** - Agent session management + streaming
- **TypeScript** - Type-safe implementation
- **Git Worktrees** - Workspace isolation
- **OpenAI/Anthropic APIs** - LLM models

## Features

✅ Template-based agent definitions  
✅ Tool sandboxing per workspace  
✅ Real-time streaming output  
✅ Parallel agent execution  
✅ Automatic cleanup & pruning  
✅ JSON configuration  
✅ Git integration  
✅ Full pi SDK support  

## Requirements

- API key for at least one LLM (OpenAI, Anthropic, etc.)
- Git (for worktree management)
- Disk space for agent workspaces

## Troubleshooting

**"No LLM models available"**
→ Configure API keys in `~/.pi/agent/auth.json`

**Agent doesn't start**
→ Check agent template model is available
→ Check workspace directory exists

**Git worktree conflicts**
→ Run: `git worktree prune` 
→ Run: `git branch | grep dispath | xargs -I {} git branch -D {}`

## Examples

### Code Review
```bash
/dispath auditor Review src/auth.ts for security vulnerabilities
```

### Research & Documentation
```bash
/dispath researcher architect Research database migration strategies
```

### Implementation
```bash
/dispath executor Write comprehensive tests for the API module
```

### Multi-Agent Workflow
```bash
/dispath analyst researcher auditor Plan and execute a security audit
```

## Status

✅ Production ready  
✅ All features working  
✅ Full SDK integration  
✅ Comprehensive documentation  

## License

MIT (same as pi)

---

**Created for pi** - The AI coding agent framework  
**Cyberpunk-themed** - Because netrunning is cool 🔌
