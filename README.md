# cmd.exe: Multi-Agent AI Orchestration System

## 🎯 Quick Start

```bash
# Switch to Build mode (default is Plan mode - read-only)
/apply --build

# One-turn build elevation (auto-reverts after the turn)
/apply

# Create and save plans
# In Plan mode: ask the LLM to create a plan, then save it
/todos:save
```

## 📦 Installation

### Prerequisites

Ensure you have [pi coding agent](https://github.com/earendil-works/pi) installed:

```bash
npm install -g @earendil-works/pi-coding-agent
# or
bun add -g @earendil-works/pi-coding-agent
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
# /apply, /todos, /todos:save, /ask
```

## ⚙️ Configuration

### Config File

`cmd.exe` reads config from:

```bash
~/.pi/agent/extensions/dispatch.json
```

### Minimal Setup

```json
{
  "slots": {
    "plan_mode": {
      "model": "github-copilot/claude-sonnet-4.5"
    },
    "build_mode": {
      "model": "github-copilot/claude-sonnet-4.5",
      "thinking": "high"
    },
    "assistant": {
      "model": "github-copilot/gpt-4o-mini"
    }
  }
}
```

If a slot omits `thinking`, cmd.exe falls back to that slot's default thinking behavior. If a provider does not support the requested thinking level, or applying it fails, cmd.exe warns instead of failing silently.

### Supported Top-Level Keys

- `slots`
- `web_search`
- `icons`
- `sandbox`

### Full Configuration Reference

See **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** for current, code-aligned schemas and defaults for each supported key.

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

Toggle with `/apply --build` command.

### ⚡ RTK Bash Optimization

If you have the official RTK pi extension (`rtk.ts`) installed globally, cmd.exe automatically detects its presence and shows an RTK status indicator in the footer. Command rewriting is handled entirely by the RTK extension — no configuration needed here. The host RTK executable and guest VM RTK installation are separate; installing RTK in `agent-vm.json` does not install it for the host pi process.

### 📋 Plan Tracking

The main session in Plan mode can create implementation plans:

```bash
# In Plan mode, ask the LLM to create a plan
/apply --build  # Switch to Plan mode (if currently in Build)
"Create a plan for refactoring the authentication system"

# Plan is auto-detected and activated
/todos  # View plan progress

# Save plan to disk
/todos:save  # Writes to .agents/plan-{timestamp}.md

# Switch to Build mode for execution
/apply --build

# Or apply once without a permanent mode switch
/apply

# LLM marks steps complete with [DONE:1], [DONE:2], etc.
```

### 🔒 Gondolin VM Sandbox

Sandboxed commands run in a Gondolin VM with mediated networking, secret placeholders, and workspace filesystem policy. Configure session policy in `dispatch.json`; configure a workspace image in root `agent-vm.json` using Gondolin's native build fields plus cmd.exe runtime settings under `cmdExe`. Normal VM control uses the SDK. Use `/init --rebuild` after changing native image packages or `postBuild` commands; custom image builds may require Docker or Podman on macOS. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md#4-sandbox-sandbox) for precedence, lifecycle commands, and image configuration.

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

### 🌐 Configurable Web Search

The optional `web_search` tool delegates web research to an isolated sub-agent. Unlike `find_files`, its sub-agent only receives tool names configured in `web_search.tools`, which can be arbitrary MCP-provided search/fetch tools.

```json
{
  "slots": {
    "plan_mode": {
      "tools": ["read", "find_files", "web_search"]
    }
  },
  "web_search": {
    "tools": ["brave_search", "fetch_url"],
    "model": "github-copilot/gpt-4o-mini",
    "thinking": "low"
  }
}
```

If `web_search.tools` is missing or empty, `web_search` is not registered. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md#2-web-search-web_search) for details.

## 📁 Project Structure

```
cmd.exe/
├── src/
│   ├── agents/           # Agent definitions
│   ├── commands/         # Command handlers
│   ├── sub-agent/        # Single-agent execution
│   ├── modes/            # Plan/Build mode system
│   ├── config/           # Slot-based configuration
│   ├── tools/            # Custom tools (find_files, web_search)
│   ├── ui/               # TUI components, dashboard
│   ├── templates/        # Agent template management
│   ├── lifecycle/        # Hooks, initialization, Gondolin VM lifecycle
│   └── sandbox/          # Gondolin policy and image configuration
├── docs/
│   ├── CONFIGURATION.md  # Complete config reference
│   └── ICONS.md          # Icon customization
└── AGENTS.md             # Agent system documentation
```

## 🚀 Usage Examples

### Strategic Planning

```bash
# Switch to Plan mode for analysis
/apply --build

# Analyze and plan
What are the architectural trade-offs for adding real-time features?

# LLM creates a plan (auto-detected)
# View progress
/todos

# Save the plan to disk
/todos:save

# Switch to Build mode for execution
/apply --build

# Execute the plan step by step
# LLM marks steps with [DONE:1], [DONE:2], etc.
```

## 🛠️ Requirements

- **pi coding agent** v0.55.0+
- **Node.js** 23.6.0+ or Bun compatible with the project dependencies
- **LLM API access** (OpenAI, Anthropic, GitHub Copilot)

## 📚 Documentation

- **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** - Complete configuration reference ⭐
- **[docs/ICONS.md](docs/ICONS.md)** - Icon customization
- **[AGENTS.md](AGENTS.md)** - Agent commands and templates

## 🎨 Design Philosophy

**Cyberpunk Aesthetic** - Neuromancer-inspired agent naming (GHOST, DATAWEAVER, HARDLINE)

**Surgical Precision** - Agents are specialists, not generalists. Each has a narrow, well-defined role.

**User Control** - Explicit mode switching and detailed monitoring give users full visibility.

## 🚧 Tech Stack

- **[@earendil-works/pi-coding-agent](https://github.com/earendil-works/pi)** - Agent session management
- **[@earendil-works/pi-tui](https://github.com/earendil-works/pi)** - Terminal UI components
- **[@earendil-works/gondolin](https://github.com/earendil-works/gondolin)** - VM-backed sandboxed execution
- **TypeScript** - Type-safe implementation
- **Bun** - Fast runtime and package management

## ✅ Status

- ✅ Dual mode system (Plan/Build) with `/apply` one-turn elevation
- ✅ Slot-based model configuration
- ✅ Plan tracking with `/todos` and `/todos:save`
- ✅ RTK extension detection (observer mode)
- ✅ Icon customization
- ✅ Comprehensive documentation
- 🔄 Advanced retry strategies (future)

## 🤝 Contributing

This is an extension for the [pi coding agent](https://github.com/earendil-works/pi). Follow pi's extension development guidelines.

## 📄 License

MIT (same as pi)

---

**Built for pi** - The AI coding agent framework  
**Cyberpunk-themed** - Because netrunning is cool 🔌
