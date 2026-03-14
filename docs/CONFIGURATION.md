# Configuration Reference

Complete reference for configuring the cmd.exe extension for pi.

## Configuration File Location

Create your configuration file at one of these locations:

```bash
# Project-specific config (highest priority)
<workspace>/.pi/extensions/cmd.exe/config.json

# User-wide config
~/.pi/extensions/cmd.exe/config.json

# Global config (shared across all users)
/etc/pi/extensions/cmd.exe/config.json
```

## Configuration Structure

```typescript
{
  // Mode configuration (Plan/Build)
  "modes": { ... },
  
  // Agent template definitions
  "agentTemplates": { ... },
  
  // Per-agent overrides
  "agents": { ... },
  
  // Model selection strategy
  "modelConfig": { ... },
  
  // Icon/emoji customization
  "icons": { ... },
  
  // Global sandbox configuration
  "sandbox": { ... }
}
```

---

## Mode Configuration

Configure Plan mode (read-only) and Build mode (full tools).

### Schema

```typescript
{
  "modes": {
    "plan": {
      "model": string,     // Model for strategic planning
      "tools": string[]    // Available tools in Plan mode
    },
    "build": {
      "model": string,     // Model for implementation
      "tools": string[]    // Available tools in Build mode
    }
  }
}
```

### Defaults

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

### Available Tools

- `read` - Read file contents
- `write` - Create or overwrite files
- `edit` - Make surgical edits to files
- `bash` - Execute shell commands
- `find_files` - Smart file discovery (spawns sub-agent)

### Example: Custom Mode Configuration

```json
{
  "modes": {
    "plan": {
      "model": "github-copilot/gpt-4o",
      "tools": ["read", "find_files", "bash"]
    },
    "build": {
      "model": "anthropic/claude-3-5-sonnet-20240620",
      "tools": ["read", "write", "edit"]
    }
  }
}
```

---

## Agent Templates

Define or customize agent templates for swarm execution.

### Schema

```typescript
{
  "agentTemplates": {
    "[agent-id]": {
      // Identity
      "id": string,                    // Agent identifier
      "name": string,                  // Display name (e.g., "GHOST")
      "description": string,           // One-line description
      "role": string,                  // Detailed role description
      
      // Behavior
      "systemPrompt": string,          // Custom instructions
      
      // Capabilities
      "tools": string[],               // Available tools
      "canWrite": boolean,             // Can write/edit files
      "canExecuteShell": boolean,      // Can run shell commands
      "readOnlyBash": boolean,         // Filter bash through allowlist
      
      // Model configuration
      "model": string,                 // LLM model to use
      "temperature": number,           // 0.0-1.0 (deterministic to creative)
      "maxTokens": number,             // Response length limit
      
      // Overrides (optional)
      "modelOverride": string,         // Override model at runtime
      "temperatureOverride": number,   // Override temperature at runtime
      "disabled": boolean,             // Disable this agent
      
      // Sandbox (optional)
      "sandbox": {
        "strategy": "none" | "sandboxExec" | "bwrap" | "custom",
        "profile": string,             // For sandboxExec
        "args": string[],              // For bwrap
        "template": string             // For custom
      }
    }
  }
}
```

### Built-in Agents (Defaults)

#### GHOST - Implementation Specialist

```json
{
  "ghost": {
    "id": "ghost",
    "name": "GHOST",
    "description": "Plan executor - implements plans and quick edits",
    "role": "Plan Executor",
    "systemPrompt": "You are GHOST, the implementation specialist...",
    "model": "github-copilot/claude-sonnet-4.5",
    "temperature": 0.1,
    "maxTokens": 4000,
    "tools": ["file_read", "file_write", "file_edit", "shell_exec"],
    "canWrite": true,
    "canExecuteShell": true,
    "sandbox": {
      "strategy": "sandboxExec"
    }
  }
}
```

#### CORTEX - Code Reviewer

```json
{
  "cortex": {
    "id": "cortex",
    "name": "CORTEX",
    "description": "Code reviewer - correctness, security, performance",
    "role": "Code Reviewer",
    "model": "github-copilot/claude-opus-4.6",
    "temperature": 0.2,
    "maxTokens": 3000,
    "tools": ["file_read", "find_files", "file_write"],
    "canWrite": true,
    "canExecuteShell": false,
    "sandbox": {
      "strategy": "sandboxExec"
    }
  }
}
```

#### DATAWEAVER - Information Researcher

```json
{
  "dataweaver": {
    "id": "dataweaver",
    "name": "DATAWEAVER",
    "description": "Researcher - explores and documents findings",
    "role": "Information Researcher",
    "model": "github-copilot/gpt-4o-mini",
    "temperature": 0.4,
    "maxTokens": 3000,
    "tools": ["file_read", "shell_exec"],
    "canWrite": false,
    "canExecuteShell": true,
    "readOnlyBash": true,
    "sandbox": {
      "strategy": "sandboxExec"
    }
  }
}
```

#### HARDLINE - Security Auditor

```json
{
  "hardline": {
    "id": "hardline",
    "name": "HARDLINE",
    "description": "Security auditor - vulnerability detection",
    "role": "Security Auditor",
    "model": "github-copilot/claude-opus-4.6",
    "temperature": 0.2,
    "maxTokens": 3000,
    "tools": ["file_read", "shell_exec"],
    "canWrite": false,
    "canExecuteShell": true,
    "sandbox": {
      "strategy": "sandboxExec"
    }
  }
}
```

#### BLACKICE - Orchestrator

```json
{
  "blackice": {
    "id": "blackice",
    "name": "BLACKICE",
    "description": "Orchestrator - task decomposition and routing",
    "role": "Orchestrator",
    "model": "github-copilot/gpt-4o",
    "temperature": 0.4,
    "maxTokens": 3000,
    "tools": ["file_read", "find_files"],
    "canWrite": false,
    "canExecuteShell": false,
    "sandbox": {
      "strategy": "none"
    }
  }
}
```

### Example: Custom Agent Template

```json
{
  "agentTemplates": {
    "tester": {
      "id": "tester",
      "name": "TESTER",
      "description": "Test engineer - writes and runs tests",
      "role": "Test Engineer",
      "systemPrompt": "You are TESTER, the automated testing specialist.\n\nYour role is to:\n- Write comprehensive test suites\n- Execute tests and analyze results\n- Identify edge cases and failure modes\n- Generate test reports\n\nFocus on:\n- Unit tests for individual functions\n- Integration tests for component interactions\n- Edge case coverage\n- Clear assertion messages",
      "model": "github-copilot/claude-sonnet-4.5",
      "temperature": 0.2,
      "maxTokens": 4000,
      "tools": ["file_read", "file_write", "shell_exec", "find_files"],
      "canWrite": true,
      "canExecuteShell": true,
      "sandbox": {
        "strategy": "sandboxExec"
      }
    }
  }
}
```

---

## Per-Agent Overrides

Override specific agent settings without redefining the entire template.

### Schema

```typescript
{
  "agents": {
    "[agent-id]": {
      "model": string,           // Override model
      "temperature": number,     // Override temperature
      "disabled": boolean        // Disable agent
    }
  }
}
```

### Example

```json
{
  "agents": {
    "ghost": {
      "model": "anthropic/claude-3-5-sonnet-20240620",
      "temperature": 0.05
    },
    "hardline": {
      "disabled": true
    }
  }
}
```

---

## Model Configuration

Dynamic model selection based on action type.

### Schema

```typescript
{
  "modelConfig": {
    "default": string,                      // Default model for all actions
    "fallback": boolean,                    // Fall back to default if override unavailable
    "overrides": {
      "main": string,                       // Primary task execution
      "auto-compat": string,                // Automatic compatibility fixes
      "analysis": string,                   // Code analysis, review
      "planning": string,                   // Plan synthesis
      "research": string,                   // Information gathering
      "testing": string,                    // Test generation/execution
      "ask": string                         // Ad-hoc queries (/ask)
    }
  }
}
```

### Action Types

| Action Type | Use Case | Example Command |
|------------|----------|-----------------|
| `main` | Primary task execution | Default swarm tasks |
| `auto-compat` | Automatic compatibility fixes | Error recovery |
| `analysis` | Code analysis, review | CORTEX reviews |
| `planning` | Plan synthesis | `/synth:plan` |
| `research` | Information gathering | DATAWEAVER exploration |
| `testing` | Test generation/execution | Test suite creation |
| `ask` | Ad-hoc ephemeral queries | `/ask` command |

### Defaults

```json
{
  "modelConfig": {
    "default": "github-copilot/claude-sonnet-4.5",
    "fallback": true
  }
}
```

### Example: Specialized Model Routing

```json
{
  "modelConfig": {
    "default": "github-copilot/claude-sonnet-4.5",
    "fallback": true,
    "overrides": {
      "main": "github-copilot/claude-sonnet-4.5",
      "planning": "github-copilot/claude-opus-4.6",
      "analysis": "github-copilot/claude-opus-4.6",
      "research": "github-copilot/gpt-4o-mini",
      "testing": "openai/gpt-4o",
      "ask": "github-copilot/haiku-4.5"
    }
  }
}
```

### Model Resolution Priority

1. **Action-specific override** (e.g., `overrides.planning`)
2. **Config default** (`default`)
3. **Current session model** (from pi context)
4. **First available model** (auto-discovery)

---

## Icon Customization

Override any icon/emoji used in the UI.

### Schema

```typescript
{
  "icons": {
    // Status indicators
    "success": string,           // ✅
    "error": string,             // ❌
    "warning": string,           // ⚠
    "pending": string,           // ⏳
    "running": string,           // 🔄
    "timeout": string,           // ⏱
    "cancelled": string,         // ⊘
    "check": string,             // ✓
    "cross": string,             // ✗
    
    // Mode indicators
    "modePlan": string,          // ⚡
    "modeBuild": string,         // 🚀
    
    // Agent indicators
    "agentBlackice": string,     // 👁️
    "agentGhost": string,        // 👻
    "agentPlanner": string,      // 🧠
    "agentDataweaver": string,   // 🕸️
    "agentDefault": string,      // ⚙️
    
    // Feature indicators
    "sandbox": string,           // 🔒
    "tool": string,              // 🔧
    "swarm": string,             // 🐝
    "dispatch": string,          // ⚡
    "jack": string,              // 🔌
    "net": string,               // 📡
    "code": string,              // 💻
    "branch": string,            // 🌿
    "lock": string,              // 🔒
    
    // Decorators
    "dot": string,               // ●
    "arrow": string,             // →
    "spark": string,             // ⚡
    
    // Dashboard status
    "statusPending": string,     // ○
    "statusRunning": string,     // ◉
    "statusComplete": string,    // ✓
    "statusFailed": string,      // ✗
    "statusTimeout": string,     // ⏱
    "statusCancelled": string    // ⊘
  }
}
```

### Defaults

See [ICONS.md](./ICONS.md) for the complete default icon set.

### Example: Custom Icon Theme

```json
{
  "icons": {
    "modePlan": "🔍",
    "modeBuild": "🔨",
    "agentGhost": "🥷",
    "agentPlanner": "📐",
    "agentCortex": "🧠",
    "agentDataweaver": "🔎",
    "swarm": "🐝",
    "success": "✔️",
    "error": "❗",
    "pending": "⌛"
  }
}
```

---

## Sandbox Configuration

Configure OS-level sandboxing for agent execution.

### Schema

```typescript
{
  "sandbox": {
    "strategy": "none" | "sandboxExec" | "bwrap" | "custom",
    "profile": string,              // Path to sandbox-exec profile (macOS)
    "args": string[],               // Arguments for bwrap (Linux)
    "template": string              // Custom sandbox command template
  }
}
```

### Strategies

| Strategy | Platform | Description |
|----------|----------|-------------|
| `none` | All | No sandboxing (development mode) |
| `sandboxExec` | macOS | Uses macOS `sandbox-exec` |
| `bwrap` | Linux | Uses Bubblewrap container |
| `custom` | All | Custom sandbox command |

### Defaults

```json
{
  "sandbox": {
    "strategy": "sandboxExec"  // macOS
    // or
    "strategy": "bwrap"        // Linux
  }
}
```

### Example: Custom Sandbox

```json
{
  "sandbox": {
    "strategy": "custom",
    "template": "firejail --noprofile --quiet --whitelist={{CWD}} -- {{COMMAND}}"
  }
}
```

---

## Complete Configuration Example

Full configuration showing all available options:

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
  },
  
  "agentTemplates": {
    "ghost": {
      "id": "ghost",
      "name": "GHOST",
      "description": "Implementation specialist",
      "role": "Plan Executor",
      "systemPrompt": "You are GHOST...",
      "model": "github-copilot/claude-sonnet-4.5",
      "temperature": 0.1,
      "maxTokens": 4000,
      "tools": ["file_read", "file_write", "file_edit", "shell_exec"],
      "canWrite": true,
      "canExecuteShell": true,
      "sandbox": {
        "strategy": "sandboxExec"
      }
    },
    "custom-agent": {
      "id": "custom",
      "name": "CUSTOM",
      "description": "Custom specialized agent",
      "role": "Custom Role",
      "systemPrompt": "You are a custom agent...",
      "model": "openai/gpt-4o",
      "temperature": 0.3,
      "maxTokens": 3000,
      "tools": ["file_read", "shell_exec"],
      "canWrite": false,
      "canExecuteShell": true,
      "readOnlyBash": true,
      "sandbox": {
        "strategy": "bwrap",
        "args": ["--ro-bind", "/usr", "/usr"]
      }
    }
  },
  
  "agents": {
    "ghost": {
      "model": "anthropic/claude-3-5-sonnet-20240620",
      "temperature": 0.05
    },
    "hardline": {
      "disabled": true
    }
  },
  
  "modelConfig": {
    "default": "github-copilot/claude-sonnet-4.5",
    "fallback": true,
    "overrides": {
      "main": "github-copilot/claude-sonnet-4.5",
      "planning": "github-copilot/claude-opus-4.6",
      "analysis": "github-copilot/claude-opus-4.6",
      "research": "github-copilot/gpt-4o-mini",
      "testing": "openai/gpt-4o",
      "ask": "github-copilot/haiku-4.5"
    }
  },
  
  "icons": {
    "modePlan": "🔍",
    "modeBuild": "🔨",
    "agentGhost": "🥷",
    "agentPlanner": "📐",
    "swarm": "🐝"
  },
  
  "sandbox": {
    "strategy": "sandboxExec"
  }
}
```

---

## Environment Variables

Some settings can be overridden via environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `CMD_EXE_CONFIG` | Path to config file | `~/.config/cmd.exe.json` |
| `CMD_EXE_NO_SANDBOX` | Disable sandboxing | `1` or `true` |
| `CMD_EXE_LOG_LEVEL` | Logging verbosity | `debug`, `info`, `warn`, `error` |

---

## Configuration Priority

Configuration is merged from multiple sources in this priority order:

1. **Environment variables** (highest)
2. **Project config** (`<workspace>/.pi/extensions/cmd.exe/config.json`)
3. **User config** (`~/.pi/extensions/cmd.exe/config.json`)
4. **Global config** (`/etc/pi/extensions/cmd.exe/config.json`)
5. **Built-in defaults** (lowest)

---

## Validation

Invalid configurations will be reported on startup:

```bash
pi
# ⚠  cmd.exe: Invalid config at modes.plan.model: must be a string
# ⚠  cmd.exe: Unknown agent template: "invalid-agent"
```

---

## Tips

### Performance Optimization

```json
{
  "modelConfig": {
    "default": "github-copilot/claude-sonnet-4.5",
    "overrides": {
      "research": "github-copilot/gpt-4o-mini",
      "ask": "github-copilot/haiku-4.5"
    }
  }
}
```

Use cheaper/faster models for simple tasks (research, ad-hoc queries).

### Cost Control

```json
{
  "modes": {
    "plan": {
      "model": "github-copilot/gpt-4o-mini"
    }
  },
  "agents": {
    "ghost": {
      "model": "github-copilot/claude-sonnet-4.5"
    }
  }
}
```

Use less expensive models for planning, reserve premium models for implementation.

### Custom Workflows

```json
{
  "agentTemplates": {
    "deployer": {
      "id": "deployer",
      "name": "DEPLOYER",
      "role": "Deployment Specialist",
      "systemPrompt": "You handle deployments...",
      "model": "github-copilot/gpt-4o",
      "temperature": 0.1,
      "tools": ["shell_exec", "file_read"],
      "canWrite": false,
      "canExecuteShell": true
    }
  }
}
```

Create specialized agents for your specific workflow needs.

---

## See Also

- [ICONS.md](./ICONS.md) - Icon customization details
- [FIND_FILES.md](./FIND_FILES.md) - Smart file discovery tool
- [AGENTS.md](../AGENTS.md) - Agent system documentation
- [README.md](../README.md) - Main documentation
