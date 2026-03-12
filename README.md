# cmd.exe: Multi-Agent AI Orchestration System

A **cyberpunk-themed multi-agent framework** for pi that enables specialized AI agents to work concurrently on complex tasks with intelligent orchestration.

## 🎯 Quick Start

```bash
# Switch to Build mode (default is Plan mode - read-only)
/ops

# Dispatch specialized agents to work in parallel
/swarm task-1 ghost "implement auth module" | task-2 blueprint "design API schema"

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

If the package is published to npm or GitHub Packages:

```bash
# Install globally via npm
npm install -g cmd.exe

# Or via bun
bun add -g cmd.exe
```

The extension will be automatically discovered by pi on startup.

### Option 2: Install from Git

Clone and link the extension directly:

```bash
# Clone the repository
git clone https://github.com/yourusername/cmd.exe.git
cd cmd.exe

# Install dependencies
npm install
# or
bun install

# Build the extension
npm run build
# or
bun run build

# Link to pi extensions directory
mkdir -p ~/.pi/extensions
ln -s "$(pwd)" ~/.pi/extensions/cmd.exe
```

### Option 3: Install as Local pi Package

Using pi's package management:

```bash
# From git URL
pi install https://github.com/yourusername/cmd.exe.git

# From local directory
pi install /path/to/cmd.exe
```

### Verify Installation

Start pi and check if the extension is loaded:

```bash
pi

# You should see cmd.exe commands available:
# /swarm, /ops, /synth:plan, /synth:exec, /blackice, etc.
```

### Configuration (Optional)

Create custom configuration at `~/.pi/extensions/cmd.exe/config.json`:

```json
{
  "modes": {
    "plan": {
      "model": "github-copilot/claude-opus-4.6",
      "tools": ["read", "find_files"]
    },
    "build": {
      "model": "github-copilot/claude-sonnet-4.5",
      "tools": ["read", "write", "edit", "bash", "find_files"]
    }
  }
}
```

See [Configuration](#️-configuration) section for full options.

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

Dispatch multiple specialized agents to work concurrently on different tasks:

```bash
/swarm task-1 ghost "fix auth bug" | task-2 cortex "analyze logs" | task-3 hardline "security audit"
```

**Swarm Commands:**

- `/swarm` - Dispatch agents with custom tasks
- `/swarm:list` - View available agent templates
- `/swarm:status` - Check swarm execution history
- `/swarm:dashboard` - Real-time interactive monitoring
- `/swarm:task <id>` - View detailed task output

**Options:**

```bash
/swarm --concurrency 3 --timeout 600000 task-1 ghost "X" | task-2 blueprint "Y"
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

Plans are saved to `.agents/plan-YYYY-MM-DD-HHMMSS.md`

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
- All intermediate reads stay in sub-agent context

**Benefits:**
- 🧹 Clean context - no directory listing pollution
- ⚡ Efficient - uses cheap models for reconnaissance
- 🎯 Thorough - deep exploration without token bloat
- 📋 Structured - returns file paths with descriptions

Available in both Plan and Build modes. See [docs/FIND_FILES.md](docs/FIND_FILES.md) for details.

## 🤖 Built-in Agent Templates

| Agent | Role | Temperature | Tools | Best For |
|-------|------|-------------|-------|----------|
| **ghost** | Implementation Specialist | 0.1 | read, write, edit, bash | Code changes, execution |
| **blueprint** | System Architect | 0.5 | read, find_files | Design, planning, architecture |
| **cortex** | Data Analyst | 0.3 | read, find_files | Pattern recognition, analysis |
| **dataweaver** | Information Researcher | 0.7 | read | Documentation, exploration |
| **hardline** | Command Executor | 0.2 | bash, read, find_files | Scripts, builds, diagnostics |
| **blackice** | Orchestrator | 0.4 | coordination | Task decomposition, routing |

Each agent has:

- **Specialized system prompt** optimized for their role
- **Curated toolset** matching their capabilities
- **Temperature tuning** for deterministic vs creative output
- **Model selection** appropriate for their task complexity

## 📁 Project Structure

```
cmd.exe/
├── src/
│   ├── agents/           # Agent definitions (ghost, blueprint, etc.)
│   ├── commands/         # Command handlers (/swarm, /synth, /ops)
│   ├── swarms/           # Multi-agent orchestration engine
│   ├── sub-agent/        # Single-agent execution runtime
│   ├── modes/            # Plan/Build mode system
│   ├── tools/            # Custom tools (find_files)
│   ├── ui/               # TUI components, dashboard, icons
│   ├── templates/        # Agent template management
│   ├── utils/            # Config, model resolution
│   └── lifecycle/        # Hooks, initialization, sandbox
├── docs/
│   ├── ICONS.md          # Icon configuration guide
│   └── FIND_FILES.md     # find_files tool documentation
├── AGENTS.md             # Agent system documentation
├── QUICKSTART.md         # Quick reference guide
├── ARCHITECTURE.md       # Technical architecture
└── IMPLEMENTATION.md     # Implementation details
```

## ⚙️ Configuration

### Configuration File Locations

Configuration files are loaded in priority order (highest to lowest):

| Priority | Path | Use Case |
|----------|------|----------|
| **Highest** | `<workspace>/.pi/extensions/cmd.exe/config.json` | Project-specific overrides |
| Medium | `~/.pi/extensions/cmd.exe/config.json` | User-wide settings *(recommended for laptop-specific configs)* |
| Lowest | `/etc/pi/extensions/cmd.exe/config.json` | Global defaults |

**Environment variable override:**
```bash
export CMD_EXE_CONFIG=~/.config/cmd.exe.json
```

### Model Override Strategies

cmd.exe supports **three independent layers** of model configuration:

#### 1. Per-Mode Models (Plan / Build)

Control which model powers your main conversation in each mode:

```json
{
  "modes": {
    "plan": {
      "model": "openai/o3",
      "tools": ["read", "find_files"]
    },
    "build": {
      "model": "anthropic/claude-sonnet-4-20250514",
      "tools": ["read", "write", "edit", "bash", "find_files"]
    }
  }
}
```

**Defaults:** Plan → `claude-opus-4.6`, Build → `claude-sonnet-4.5`

#### 2. Per-Agent Models (Swarm Agents)

Override models for specific agents without redefining their entire template:

```json
{
  "agents": {
    "ghost": {
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.05
    },
    "blueprint": {
      "model": "openai/o3",
      "temperature": 0.7
    },
    "cortex": {
      "model": "openai/gpt-4o"
    },
    "hardline": {
      "disabled": true
    }
  }
}
```

This affects models used by `/swarm` and `/synth` commands.

#### 3. Per-Action Models (Sub-Agents & Tools)

Control which model handles specific action types. This includes the **`find_files` reconnaissance model**:

```json
{
  "modelConfig": {
    "default": "anthropic/claude-sonnet-4-20250514",
    "fallback": true,
    "overrides": {
      "research": "openai/gpt-4o-mini",        // Controls find_files tool
      "planning": "openai/o3",                  // Used by /synth:plan
      "analysis": "openai/o3",                  // Used by CORTEX reviews
      "ask": "anthropic/claude-haiku-3-5",     // Used by /ask command
      "testing": "openai/gpt-4o"
    }
  }
}
```

**Action Types:**
- `research` - DATAWEAVER sub-agent (powers `find_files` tool)
- `planning` - Plan synthesis
- `analysis` - Code reviews and analysis
- `ask` - Ad-hoc queries via `/ask`
- `testing` - Test generation
- `main` - Default for unspecified actions

**Model Resolution Chain:**
```
Action Override → Config Default → Current Session Model → First Available
```

With `"fallback": true`, missing models degrade gracefully rather than error.

### Complete Configuration Example

```json
{
  "modes": {
    "plan": {
      "model": "openai/o3",
      "tools": ["read", "find_files"]
    },
    "build": {
      "model": "anthropic/claude-sonnet-4-20250514",
      "tools": ["read", "write", "edit", "bash", "find_files"]
    }
  },
  "agents": {
    "ghost": {
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.05
    },
    "blueprint": {
      "model": "openai/o3"
    },
    "cortex": {
      "model": "openai/gpt-4o"
    }
  },
  "modelConfig": {
    "default": "anthropic/claude-sonnet-4-20250514",
    "fallback": true,
    "overrides": {
      "research": "openai/gpt-4o-mini",
      "ask": "anthropic/claude-haiku-3-5"
    }
  },
  "icons": {
    "modePlan": "🔍",
    "modeBuild": "🔨",
    "agentGhost": "🥷"
  }
}
```

### Using Config on Different Laptops

**Problem:** Different machines have access to different model providers.

**Solution:** Create a user-wide config at `~/.pi/extensions/cmd.exe/config.json` with your available models:

```json
{
  "modes": {
    "plan": { "model": "openai/gpt-4o" },
    "build": { "model": "openai/gpt-4o-mini" }
  },
  "modelConfig": {
    "default": "openai/gpt-4o-mini",
    "fallback": true,
    "overrides": {
      "research": "openai/gpt-4o-mini",
      "planning": "openai/gpt-4o"
    }
  }
}
```

With `"fallback": true`, unavailable models automatically fall back to the next available option.

### All Configuration Sections

- **`modes`** - Plan/Build mode settings (models, tools)
- **`agentTemplates`** - Define or customize agent templates
- **`agents`** - Per-agent overrides (model, temperature, disabled)
- **`modelConfig`** - Dynamic model selection by action type
- **`icons`** - Customize UI icons/emojis
- **`sandbox`** - OS-level sandboxing configuration

### Full Documentation

See **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** for:
- Complete schema reference with all fields
- Built-in agent template definitions
- Model resolution strategies and priority chains
- Sandbox configuration (sandboxExec, bwrap, custom)
- Icon customization reference
- Environment variables
- Configuration merging and validation
- Performance optimization tips
- Cost control strategies

## 🚀 Usage Examples

### Multi-Agent Workflow

```bash
# Complex refactoring with specialized agents
/swarm \
  task-1 blueprint "Design new authentication flow" | \
  task-2 hardline "Audit current security vulnerabilities" | \
  task-3 ghost "Implement OAuth2 integration" | \
  task-4 cortex "Analyze authentication patterns in logs"

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
/blackice Migrate our authentication system from session-based to JWT tokens with refresh token rotation, including database migrations and backward compatibility
```

### Security Audit

```bash
# Comprehensive security review
/swarm \
  task-1 hardline "Audit API endpoints for vulnerabilities" | \
  task-2 hardline "Review authentication & authorization" | \
  task-3 dataweaver "Document security best practices we're missing"

# View results
/swarm:status
```

## 📊 Monitoring & Debugging

### Swarm State

Swarms are persisted to `<workspace>/.swarms/`:

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
  ],
  "stats": {
    "totalTasks": 3,
    "completedTasks": 3,
    "totalDuration": 45000
  }
}
```

### Dashboard

Real-time monitoring with `/swarm:dashboard`:

- Task status and progress bars
- Token usage statistics
- Execution timelines
- Output previews
- Interactive navigation (tab/arrows/enter)

### Output Logs

Agent output is recorded:

- Truncated output in swarm state
- Full output in `.swarms/<swarm-id>/<task-id>.log`
- View with `/swarm:task <task-id>` or `/synth:output`

## 🛠️ Requirements

- **pi coding agent** v0.55.0+
- **Node.js** 18+ or Bun
- **LLM API access** (OpenAI, Anthropic, GitHub Copilot)
- **Git** (optional, for workspace isolation)

## 📚 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Quick reference guide
- **[AGENTS.md](AGENTS.md)** - Agent types and templates
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical architecture
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Implementation details
- **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** - Complete configuration reference
- **[docs/ICONS.md](docs/ICONS.md)** - Icon configuration and customization
- **[docs/FIND_FILES.md](docs/FIND_FILES.md)** - Smart file discovery tool

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
