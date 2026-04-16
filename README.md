# cmd.exe: Multi-Agent AI Orchestration System

A **cyberpunk-themed multi-agent framework** for pi that enables specialized AI agents to work concurrently on complex tasks with intelligent orchestration.

## 🎯 Quick Start

```bash
# Switch to Build mode (default is Plan mode - read-only)
/ops

# Dispatch specialized agents to work in parallel
/swarm task-1 ghost "implement auth module" | task-2 dataweaver "map authentication flow"

# Let BLACKICE orchestrator decompose complex tasks
/blackice refactor the authentication system for better security

# Use single agents for focused work
/synth:plan Review the codebase architecture
/synth:exec Implement the planned changes
```

## 📦 Installation

### Prerequisites

Ensure you have [pi coding agent](https://github.com/badlogic/pi) installed:

```bash
npm install -g @mariozechner/pi-coding-agent
# or
bun add -g @mariozechner/pi-coding-agent
```

### Option 1: Install from npm (Recommended)

```bash
# Install globally via npm
npm install -g cmd.exe

# Or via bun
bun add -g cmd.exe
```

### Option 2: Install from Git

```bash
git clone https://github.com/yourusername/cmd.exe.git
cd cmd.exe
npm install && npm run build

# Link to pi extensions directory
mkdir -p ~/.pi/extensions
ln -s "$(pwd)" ~/.pi/extensions/cmd.exe
```

### Option 3: Install as Local pi Package

```bash
pi install https://github.com/yourusername/cmd.exe.git
# or
pi install /path/to/cmd.exe
```

### Verify Installation

```bash
pi
# You should see cmd.exe commands available:
# /swarm, /ops, /synth:plan, /synth:exec, /blackice, etc.
```

## ⚙️ Configuration

### Quick Setup

Create `~/.pi/agent/extensions/dispatch.json`:

```json
{
  "slots": {
    "plan_mode": {
      "model": "claude-opus-4.6"
    },
    "build_mode": {
      "model": "claude-sonnet-4.5",
      "thinking": "high"
    },
    "assistant": {
      "model": "gpt-4o-mini"
    }
  }
}
```

### What Each Slot Controls

| Slot | Controls |
|------|----------|
| `plan_mode` | Main session in Plan mode + `/synth:plan` |
| `build_mode` | Main session in Build mode + `/synth:exec` |
| `assistant` | Background tools (`find_files`, DATAWEAVER) |

**Note:** `/ask` uses the current mode's slot (no separate config needed).

### Full Configuration Reference

See **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** for:

- Complete slots configuration with thinking levels and tools
- Teams configuration (model policies, action types, member overrides)
- Agent template definitions and customization
- Icon customization
- Sandbox configuration
- Model resolution strategies
- Performance and cost optimization tips

## 🌟 Core Features

### 🔄 Dual Operating Modes

**Plan Mode** (default) - Strategic planning without mutations

- Read-only access to codebase
- Heavy reasoning model (ex: Claude Opus 4.6)
- Perfect for analysis, design, and architecture
- Footer shows: `⚡ PLAN`

**Build Mode** - Full implementation access

- Complete tool access: read, write, edit, bash
- Fast execution model (ex: Claude Sonnet 4.6)
- Surgical code changes and testing
- Footer shows: `🚀 BUILD`

Toggle with `/ops` command.

### 🐝 Multi-Agent Swarms

Dispatch multiple specialized agents to work concurrently:

```bash
/swarm task-1 ghost "fix auth bug" | task-2 cortex "analyze logs" | task-3 hardline "security audit"
```

**Commands:**

- `/swarm` - Dispatch agents with custom tasks
- `/swarm:list` - View available agent templates
- `/swarm:status` - Check swarm execution history
- `/swarm:dashboard` - Real-time interactive monitoring
- `/swarm:task <id>` - View detailed task output

**Options:**

```bash
/swarm --concurrency 3 --timeout 600000 task-1 ghost "X" | task-2 dataweaver "Y"
```

- `--concurrency N` - Max parallel tasks (default: 5)
- `--timeout N` - Per-task timeout in milliseconds (default: 300000)
- `--recordOutput` - Output recording: none, truncated, full
- `--retryFailed` - Retry failed tasks automatically

### 🧠 Single-Agent Synthesis

Execute focused tasks with specialized agents:

```bash
/synth:plan [focus]          # BLUEPRINT agent creates implementation plan
/synth:exec [mission]         # GHOST agent executes with full tools
/synth:output                 # View agent output in scrollable overlay
```

Plans are saved under `.agents/dispatch/.agents/plan-YYYY-MM-DD-HHMMSS.md`.

### 👁️ BLACKICE Orchestrator

Intelligent task decomposition and routing:

```bash
/blackice <complex-request>
```

BLACKICE analyzes your request, breaks it into specialized subtasks, and dispatches the optimal agents automatically.

### 🔍 Smart File Discovery

The `find_files` tool keeps your context clean by delegating file searches to an isolated DATAWEAVER sub-agent:

```bash
# The LLM calls this automatically when needed
find_files({ query: "authentication middleware" })
```

**How it works:**
- Spawns DATAWEAVER in isolated session
- Explores codebase with full read access
- Returns only curated file list to main session
- Uses cheap model configured in `assistant` slot

Available in both Plan and Build modes.

## 🤖 Built-in Agent Templates

| Agent | Role | Temperature | Tools | Best For |
|-------|------|-------------|-------|----------|
| **ghost** | Implementation Specialist | 0.1 | read, write, edit, bash | Code changes, execution |
| **dataweaver** | Information Researcher | 0.7 | read | Documentation, exploration |
| **hardline** | Command Executor | 0.2 | bash, read, find_files | Scripts, builds, diagnostics |

Each agent has:

- **Specialized system prompt** optimized for their role
- **Curated toolset** matching their capabilities
- **Temperature tuning** for deterministic vs creative output
- **Model selection** appropriate for their task complexity

## 📁 Project Structure

```
cmd.exe/
├── src/
│   ├── agents/           # Agent definitions
│   ├── commands/         # Command handlers
│   ├── swarms/           # Multi-agent orchestration
│   ├── sub-agent/        # Single-agent execution
│   ├── modes/            # Plan/Build mode system
│   ├── config/           # Slot-based configuration
│   ├── tools/            # Custom tools (find_files)
│   ├── ui/               # TUI components, dashboard
│   ├── templates/        # Agent template management
│   └── lifecycle/        # Hooks, initialization
├── docs/
│   ├── CONFIGURATION.md  # Complete config reference
│   └── ICONS.md          # Icon customization
├── AGENTS.md             # Agent system documentation
├── QUICKSTART.md         # Quick reference guide
├── ARCHITECTURE.md       # Technical architecture
└── IMPLEMENTATION.md     # Implementation details
```

## 🚀 Usage Examples

### Multi-Agent Workflow

```bash
# Complex refactoring with specialized agents
/swarm \
  task-1 dataweaver "Design new authentication flow" | \
  task-2 hardline "Audit current security vulnerabilities" | \
  task-3 ghost "Implement OAuth2 integration"

# Monitor progress
/swarm:dashboard
```

### Strategic Planning

```bash
# Switch to Plan mode for analysis
/ops

# Analyze and plan
What are the architectural trade-offs for adding real-time features?

# Generate detailed plan
/synth:plan Real-time architecture design

# Switch to Build mode for execution
/ops

# Execute the plan
/synth:exec Implement WebSocket infrastructure per the plan
```

### Intelligent Orchestration

```bash
# Let BLACKICE figure out the optimal approach
/blackice Migrate our authentication system from session-based to JWT tokens with refresh token rotation
```

### Security Audit

```bash
# Comprehensive security review
/swarm \
  task-1 hardline "Audit API endpoints for vulnerabilities" | \
  task-2 hardline "Review authentication & authorization" | \
  task-3 dataweaver "Document security best practices we're missing"
```

## 📊 Monitoring & Debugging

### Swarm State

Swarms are persisted under `<workspace>/.agents/dispatch/` (registry: `.dispatch-swarms.json`):

```json
{
  "id": "swarm-1234567890",
  "status": "completed",
  "tasks": [
    {
      "id": "task-1",
      "agent": "ghost",
      "status": "completed",
      "duration": 12450,
      "tokens": { "input": 1200, "output": 3400 }
    }
  ]
}
```

### Dashboard

Real-time monitoring with `/swarm:dashboard`:

- Task status and progress bars
- Token usage statistics
- Execution timelines
- Output previews
- Interactive navigation

### Output Logs

- Truncated output in swarm state
- Full output in `.agents/dispatch/output/<swarm-id>/<task-id>.log`
- View with `/swarm:task <task-id>` or `/synth:output`

## 🛠️ Requirements

- **pi coding agent** v0.55.0+
- **Node.js** 18+ or Bun
- **LLM API access** (OpenAI, Anthropic, GitHub Copilot)
- **Git** (optional, for workspace isolation)

## 📚 Documentation

- **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** - Complete configuration reference ⭐
- **[docs/ICONS.md](docs/ICONS.md)** - Icon customization
- **[AGENTS.md](AGENTS.md)** - Agent types and swarm commands
- **[QUICKSTART.md](QUICKSTART.md)** - Quick reference guide
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical architecture
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Implementation details

## 🎨 Design Philosophy

**Cyberpunk Aesthetic** - Neuromancer-inspired agent naming (GHOST, BLACKICE, CORTEX)

**Surgical Precision** - Agents are specialists, not generalists. Each has a narrow, well-defined role.

**Concurrent Execution** - Multiple agents work simultaneously with intelligent coordination.

**Persistent State** - All executions are recorded for debugging and analysis.

**User Control** - Explicit mode switching and detailed monitoring give users full visibility.

## 🚧 Tech Stack

- **[@mariozechner/pi-coding-agent](https://github.com/badlogic/pi)** - Agent session management
- **[@mariozechner/pi-tui](https://github.com/badlogic/pi)** - Terminal UI components
- **[@anthropic-ai/sandbox-runtime](https://github.com/anthropics/anthropic-sdk-typescript)** - Sandboxed execution
- **TypeScript** - Type-safe implementation
- **Bun** - Fast runtime and package management

## ✅ Status

- ✅ Multi-agent swarm execution
- ✅ Dual mode system (Plan/Build)
- ✅ Slot-based model configuration
- ✅ Teams configuration support
- ✅ Real-time monitoring dashboard
- ✅ Persistent swarm state
- ✅ BLACKICE orchestration
- ✅ Sub-agent synthesis
- ✅ Icon customization
- ✅ Comprehensive documentation
- 🔄 Git worktree isolation (optional)
- 🔄 Advanced retry strategies (future)

## 🤝 Contributing

This is an extension for the [pi coding agent](https://github.com/badlogic/pi). Follow pi's extension development guidelines.

## 📄 License

MIT (same as pi)

---

**Built for pi** - The AI coding agent framework  
**Cyberpunk-themed** - Because netrunning is cool 🔌
