# cmd.exe: Multi-Agent AI Orchestration System

## 🎯 Quick Start

```bash
# Switch to Build mode (default is Plan mode - read-only)
/plan

# Create and save plans
# In Plan mode: ask the LLM to create a plan, then save it
/plan:save

# Toggle RTK bash optimization (when installed + enabled in config)
/rtk
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
# /plan, /todos, /plan:save, /ask, /rtk
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

### Supported Top-Level Keys

- `slots`
- `rtk_enabled`
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

Toggle with `/plan` command.

### ⚡ RTK Bash Optimization

When `rtk_enabled` is set and `rtk` is available in your PATH, cmd.exe prefixes supported bash commands with `rtk`.

- Reduces token-heavy shell output for supported commands
- Safe fallback: if `rtk` is missing, normal bash execution is used
- Runtime toggle: `/rtk`

### 📋 Plan Tracking

The main session in Plan mode can create implementation plans:

```bash
# In Plan mode, ask the LLM to create a plan
/plan  # Switch to Plan mode
"Create a plan for refactoring the authentication system"

# Plan is auto-detected and activated
/todos  # View plan progress

# Save plan to disk
/plan:save  # Writes to .agents/plan-{timestamp}.md

# Execute in Build mode
/plan  # Switch to Build mode
# LLM marks steps complete with [DONE:1], [DONE:2], etc.
```

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

## 📁 Project Structure

```
cmd.exe/
├── src/
│   ├── agents/           # Agent definitions
│   ├── commands/         # Command handlers
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
└── AGENTS.md             # Agent system documentation
```

## 🚀 Usage Examples

### Strategic Planning

```bash
# Switch to Plan mode for analysis
/plan

# Analyze and plan
What are the architectural trade-offs for adding real-time features?

# LLM creates a plan (auto-detected)
# View progress
/todos

# Save the plan to disk
/plan:save

# Switch to Build mode for execution
/plan

# Execute the plan step by step
# LLM marks steps with [DONE:1], [DONE:2], etc.
```

## 🛠️ Requirements

- **pi coding agent** v0.55.0+
- **Node.js** 18+ or Bun
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
- **[@anthropic-ai/sandbox-runtime](https://github.com/anthropics/anthropic-sdk-typescript)** - Sandboxed execution
- **TypeScript** - Type-safe implementation
- **Bun** - Fast runtime and package management

## ✅ Status

- ✅ Dual mode system (Plan/Build)
- ✅ Slot-based model configuration
- ✅ Plan tracking with `/todos` and `/plan:save`
- ✅ RTK bash optimization
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
