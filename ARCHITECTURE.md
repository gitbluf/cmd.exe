# Dispath: AI Agent Framework for Pi

## Overview

Dispath is a **cyberpunk-themed multi-agent orchestration system** built into pi that spawns AI agents with specialized roles, models, and tools. Each agent runs in an isolated git worktree with its own system prompt, can access specific tools, and streams output in real-time.

## Architecture

### Three-Tier System

```
┌─────────────────────────────────────────────────────────┐
│  User Interface (pi extension command)                  │
│  /dispath [count|types] [mission]                       │
└──────────┬────────────────────────────────────────────┬─┘
           │
           ├──→ Config Loading
           │    └──→ ~/.pi/agent/extensions/dispath.json
           │        (agent templates + tool definitions)
           │
           ├──→ Git Worktree Creation
           │    └──→ ~/.pi/agent/dispath/
           │        └──→ <timestamp>-<id>/ (isolated workspace)
           │
           └──→ Agent Session Spawning
                └──→ AgentExecutor (pi SDK integration)
                    ├──→ Model Setup (OpenAI, Anthropic, etc.)
                    ├──→ Tool Loading
                    ├──→ System Prompt Injection
                    └──→ Session Execution + Streaming
```

### Agent Templates

Each template defines a specialized agent persona:

```typescript
interface AgentTemplate {
  role: string;                  // e.g., "Data Analyst"
  description: string;
  systemPrompt: string;          // Full system prompt
  model: string;                 // Model to use
  tools: string[];               // Available tools
  maxTokens: number;
  temperature: number;           // Creativity (0.0-1.0)
}
```

### Built-in Agent Types

| Type | Role | Temp | Tools | Use Case |
|------|------|------|-------|----------|
| **analyst** | Data Analyst | 0.3 | read, write, bash | Pattern recognition, analysis |
| **executor** | Task Executor | 0.2 | bash, write, edit | Implementation, automation |
| **researcher** | Researcher | 0.7 | read, web_search, write | Exploration, documentation |
| **auditor** | Security Auditor | 0.2 | read, bash, write | Code review, vulnerability scan |
| **architect** | System Architect | 0.5 | write, read | Design, planning, blueprints |

## Usage

### Spawn Specific Agent Types

```bash
pi
/dispath analyst executor researcher My mission briefing
```

Spawns 3 agents (one of each type) for the given mission.

### Spawn N Random Agents

```bash
/dispath 3 Analyze this codebase
```

Spawns 3 agents with random types.

### Spawn Multiple of Same Type

```bash
/dispath 2 analyst Debug the following issues
```

Spawns 2 analyst agents.

### Interactive Mode

```bash
/dispath
```

Prompted to enter count/types and mission.

## What Happens on Spawn

1. **Directory Setup**
   - Creates isolated workspace at `~/.pi/agent/dispath/<timestamp>-<id>/`
   - Initialize git worktree with unique branch `dispath/agent-<n>`

2. **Configuration**
   - Writes `.agent.json` with agent config and template
   - Writes `README.md` with role and mission
   - Copies `run-agent.sh` executor template

3. **Execution** (Asynchronous)
   - Creates pi `AgentSession` using pi SDK
   - Sets custom system prompt from template
   - Loads specified tools (file_read, bash, etc.)
   - Sends mission prompt to agent
   - Streams output back to console
   - Saves `.agent-state.json` on completion

## Agent SDK Integration

### How It Works

Each agent is a full pi `AgentSession` created with:

```typescript
const { session } = await createAgentSession({
  cwd: agentWorkspace,
  model: selectedModel,           // From template
  tools: buildTools(),            // From template
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

// Custom system prompt injection
const loader = new DefaultResourceLoader({
  cwd: agentWorkspace,
  systemPromptOverride: () => templateSystemPrompt,
});
```

### Event Streaming

Agents stream output in real-time via event subscription:

```typescript
session.subscribe((event) => {
  case "message_update":      // LLM output
  case "tool_execution_start": // Tool started
  case "tool_execution_update": // Tool progress
  case "tool_execution_end":   // Tool finished
  case "agent_end":            // Agent done
});
```

### Tool Support

Agents have access to configured tools:

- **file_read** - Read file contents (`cat` equivalent)
- **file_write** - Create/write files (`tee` equivalent)
- **file_edit** - Edit files inline
- **shell_exec** - Execute shell commands (`bash` equivalent)

Tools are **sandboxed to agent workspace** - paths resolve relative to `~/.pi/agent/dispath/<id>/`

## Configuration

### Default Config: `~/.pi/agent/extensions/dispath.json`

```json
{
  "defaultAgents": 3,
  "defaultMission": "Infiltrate the monolith...",
  "agentTemplates": {
    "analyst": { ... },
    "executor": { ... },
    ...
  },
  "availableTools": { ... }
}
```

### Customizing Templates

Edit `dispath.json` to add custom agent types:

```json
{
  "agentTemplates": {
    "myagent": {
      "role": "Custom Role",
      "description": "What it does",
      "systemPrompt": "You are a custom agent. Your job is to...",
      "model": "gpt-4",
      "tools": ["file_read", "file_write", "shell_exec"],
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

## Workspace Structure

Each agent gets its own isolated git worktree:

```
~/.pi/agent/dispath/
├── .git/                     # Main repo
├── main                      # Main branch
├── .gitkeep
│
└── 1772145128544-0/          # Agent workspace
    ├── .git/                 # Worktree .git
    ├── .agent.json           # Agent config
    ├── .agent-state.json     # Execution state
    ├── README.md             # Role + mission
    ├── run-agent.sh          # Executor script
    └── [agent's work files]
```

### Viewing Agent Work

```bash
# List all agent workspaces
cd ~/.pi/agent/dispath
git worktree list

# Enter a workspace
cd ~/.pi/agent/dispath/1772145128544-0

# See agent config
cat .agent.json

# See execution results
cat .agent-state.json

# View agent's commits
git log

# See what agent created
ls -la
```

### Cleanup

```bash
cd ~/.pi/agent/dispath

# Remove specific worktree
git worktree remove -f 1772145128544-0

# Prune all stale worktrees
git worktree prune

# Remove all dispath branches
git branch | grep dispath | xargs -I {} git branch -D {}
```

## Advanced: Creating Custom Templates

### Example: Custom "DevOps" Agent

Add to `~/.pi/agent/extensions/dispath.json`:

```json
{
  "agentTemplates": {
    "devops": {
      "role": "DevOps Engineer",
      "description": "Infrastructure automation and deployment",
      "systemPrompt": "You are a cyberpunk DevOps engineer. Your job is to:\n1. Analyze infrastructure needs\n2. Write deployment scripts\n3. Configure CI/CD pipelines\n4. Optimize system performance\nBe pragmatic and security-conscious.",
      "model": "gpt-4",
      "tools": ["file_read", "file_write", "shell_exec"],
      "maxTokens": 8192,
      "temperature": 0.3
    }
  }
}
```

Spawn with:
```bash
/dispath devops Set up CI/CD for this project
```

## System Requirements

- **API Keys**: OpenAI, Anthropic, or other configured in `~/.pi/agent/auth.json`
- **Git**: For worktree isolation
- **Disk Space**: Each agent needs a workspace directory

## Limitations & Future Work

### Current
- ✅ Agent templates with customizable prompts/tools
- ✅ Isolated git worktree execution
- ✅ Real-time streaming output
- ✅ Tool sandboxing
- ✅ Multi-agent spawning

### Coming Soon
- ⏳ Agent-to-agent communication
- ⏳ Result aggregation and synthesis
- ⏳ Persistent session history (beyond JSON state)
- ⏳ Custom tool definitions
- ⏳ Agent monitoring dashboard
- ⏳ Scheduled/recurring agents
- ⏳ Agent error recovery and retries

## Troubleshooting

### "No LLM models available"
→ Configure API keys in `~/.pi/agent/auth.json`

### Agent doesn't start
→ Check `pi --version` supports SDK features
→ Check agent template model exists (`getModel()`)

### Git worktree already exists
→ Run: `git worktree prune` to clean stale entries
→ Run: `git branch | grep dispath | xargs -I {} git branch -D {}`

### Agent output not showing
→ Check mission prompt is being sent (should log "📡 Sending mission...")
→ Check for errors in agent workspace: `cat .agent-state.json`

## Examples

### Code Review Task
```bash
/dispath auditor Review src/ directory for security issues
```

### Research Task
```bash
/dispath researcher architect Analyze alternatives for database migration
```

### Implementation Task
```bash
/dispath executor Write tests for the new authentication module
```

### Multi-Agent Workflow
```bash
/dispath analyst researcher auditor Plan and execute a security audit
```

This spawns 3 agents:
1. **Analyst** - Analyzes current security posture
2. **Researcher** - Researches vulnerabilities and best practices
3. **Auditor** - Reviews findings and validates implementations

All work independently in parallel, all results saved in their workspaces.
