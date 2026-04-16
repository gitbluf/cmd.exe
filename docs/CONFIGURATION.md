# Configuration Reference

Complete reference for configuring the cmd.exe extension for pi.

## Configuration File Location

```bash
~/.pi/agent/extensions/dispatch.json
```

## Configuration Structure

```typescript
{
  // Slot-based model configuration (NEW)
  "slots": { ... },
  
  // Agent template definitions
  "agentTemplates": { ... },
  
  // Per-agent overrides
  "agents": { ... },
  
  // Teams configuration
  "teams": { ... },
  
  // Icon/emoji customization
  "icons": { ... },
  
  // Global sandbox configuration
  "sandbox": { ... }
}
```

---

## Slots Configuration (Model Selection)

The new unified model configuration system. Three slots control all model selection:

- **`plan_mode`** - Main session in Plan mode + `/synth:plan` sub-agent
- **`build_mode`** - Main session in Build mode + `/synth:exec` sub-agent  
- **`assistant`** - Background tools (find_files, DATAWEAVER)

### Schema

```typescript
{
  "slots": {
    "plan_mode": {
      "model": string,              // LLM model ID
      "thinking"?: ThinkingLevel,   // Reasoning depth
      "tools"?: string[]            // Available tools
    },
    "build_mode": {
      "model": string,
      "thinking"?: ThinkingLevel,
      "tools"?: string[]
    },
    "assistant": {
      "model": string,
      "thinking"?: ThinkingLevel
    }
  }
}
```

### Thinking Levels

```typescript
"off" | "minimal" | "low" | "medium" | "high" | "xhigh"
```

Controls reasoning depth for models that support it (Claude Opus, o1, etc.)

### Defaults

```json
{
  "slots": {
    "plan_mode": {
      "model": "claude-sonnet-4.5",
      "tools": ["read", "find_files"]
    },
    "build_mode": {
      "model": "claude-sonnet-4.5",
      "thinking": "high",
      "tools": ["read", "write", "edit", "bash", "find_files"]
    },
    "assistant": {
      "model": "gpt-4o-mini"
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

### Slot → Consumer Mapping

| Slot | Controls | When Used |
|------|----------|-----------|
| `plan_mode` | Main session in Plan mode | After `/ops` toggle to Plan |
| | `/synth:plan` sub-agent | When you run `/synth:plan` |
| `build_mode` | Main session in Build mode | After `/ops` toggle to Build |
| | `/synth:exec` sub-agent | When you run `/synth:exec` |
| `assistant` | `find_files` tool | When LLM calls `find_files()` |
| | DATAWEAVER sub-agent | Background file reconnaissance |

**Note:** `/ask` uses the current mode's slot (plan or build) - no separate slot.

### Example: Minimal Configuration

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

### Example: Cost-Optimized

```json
{
  "slots": {
    "plan_mode": {
      "model": "claude-sonnet-4.5"
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

### Example: Performance-Optimized

```json
{
  "slots": {
    "plan_mode": {
      "model": "claude-opus-4.6",
      "thinking": "high"
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

### Example: Local Models

```json
{
  "slots": {
    "plan_mode": {
      "model": "ollama/gemma-2-27b"
    },
    "build_mode": {
      "model": "ollama/codestral",
      "thinking": "medium"
    },
    "assistant": {
      "model": "ollama/gemma-2-9b"
    }
  }
}
```

### Model Matching

Models are matched by:

1. **Exact match** - `"github-copilot/gpt-4o-mini"`
2. **Provider/ID match** - `"github-copilot/gpt-4o-mini"`
3. **Suffix match** - `"gpt-4o-mini"` → matches any provider's gpt-4o-mini

If a model is unavailable, the system falls back to the current session model.

### Backward Compatibility

Old `modelConfig` and `modes` keys are auto-migrated with deprecation warnings:

```json
// OLD (deprecated)
{
  "modelConfig": {
    "default": "claude-sonnet-4.5",
    "overrides": {
      "planning": "claude-opus-4.6",
      "research": "gpt-4o-mini"
    }
  },
  "modes": {
    "plan": { "model": "claude-opus-4.6" }
  }
}

// NEW (use this)
{
  "slots": {
    "plan_mode": { "model": "claude-opus-4.6" },
    "build_mode": { "model": "claude-sonnet-4.5" },
    "assistant": { "model": "gpt-4o-mini" }
  }
}
```

---

## Teams Configuration

Configure multi-agent team coordination, model policies, and thinking levels.

### Schema

```typescript
{
  "teams": {
    "enabled": boolean,
    "defaultThinking": ThinkingLevel,
    "modelPolicy": {
      "default": string,
      "fallback": boolean,
      "strict": boolean,
      "disallowDeprecatedInheritance": boolean,
      "overrides": Record<TeamActionType, string>,
      "memberOverrides": Record<string, string>
    }
  }
}
```

### Defaults

```json
{
  "teams": {
    "enabled": false,
    "defaultThinking": "medium",
    "modelPolicy": {
      "fallback": true,
      "strict": false,
      "disallowDeprecatedInheritance": true
    }
  }
}
```

### Team Action Types

Model overrides by action type (what the team is doing):

| Action | Purpose |
|--------|---------|
| `leader` | Team leader coordination |
| `teammate_default` | Default for any team member |
| `delegate` | Delegating work to a member |
| `task_planning` | Breaking work into tasks |
| `task_execution` | Executing assigned tasks |
| `review` | Reviewing completed work |
| `research` | Information gathering |
| `message_summarization` | Summarizing team messages |
| `hooks` | Lifecycle hook execution |

### Model Resolution Priority

Teams use their own model resolution chain:

```
1. explicit model       — passed directly to the call
2. memberOverride       — teams.modelPolicy.memberOverrides["alice"]
3. actionOverride       — teams.modelPolicy.overrides["task_execution"]
4. policyDefault        — teams.modelPolicy.default
5. globalDefault        — slots.build_mode.model
6. currentSession       — whatever model the session is currently using
7. firstAvailable       — first model in registry
```

**Note:** Teams config is independent from slots. Slots only serve as a fallback at step 5.

### Policy Options

| Option | Default | Description |
|--------|---------|-------------|
| `fallback` | `true` | Allow fallback chain when preferred model unavailable |
| `strict` | `false` | Fail immediately when model cannot be resolved |
| `disallowDeprecatedInheritance` | `true` | Block inheriting deprecated model IDs to teammates |

### Example: Basic Teams Config

```json
{
  "teams": {
    "enabled": true,
    "defaultThinking": "medium",
    "modelPolicy": {
      "default": "claude-sonnet-4.5"
    }
  }
}
```

### Example: Action-Specific Models

```json
{
  "teams": {
    "enabled": true,
    "defaultThinking": "high",
    "modelPolicy": {
      "default": "claude-sonnet-4.5",
      "overrides": {
        "leader": "claude-opus-4.6",
        "task_planning": "claude-opus-4.6",
        "task_execution": "claude-sonnet-4.5",
        "review": "claude-opus-4.6",
        "research": "gpt-4o-mini",
        "message_summarization": "gpt-4o-mini",
        "hooks": "gpt-4o-mini"
      }
    }
  }
}
```

### Example: Member-Specific Models

```json
{
  "teams": {
    "enabled": true,
    "modelPolicy": {
      "default": "claude-sonnet-4.5",
      "memberOverrides": {
        "alice": "claude-opus-4.6",
        "bob": "gpt-4o-mini"
      }
    }
  }
}
```

Member overrides take priority over action overrides.

### Example: Strict Policy

```json
{
  "teams": {
    "enabled": true,
    "modelPolicy": {
      "default": "claude-opus-4.6",
      "fallback": false,
      "strict": true
    }
  }
}
```

With `strict: true`, teams will fail immediately if the configured model is unavailable (no fallback).

---

## Agent Templates

Define or customize agent templates for swarm execution.

> **Runtime defaults vs optional templates**
>
> - **Default-loaded templates:** `ghost`, `dataweaver`, `hardline`
> - **Defined in source but not default-loaded:** `cortex`, `blackice`, `blueprint`
>
> To use optional templates, add them to `agentTemplates` in your config.

### Schema

```typescript
{
  "agentTemplates": {
    "[agent-id]": {
      // Identity
      "id": string,
      "name": string,
      "description": string,
      "role": string,
      
      // Behavior
      "systemPrompt": string,
      
      // Capabilities
      "tools": string[],
      "canWrite": boolean,
      "canExecuteShell": boolean,
      "readOnlyBash": boolean,
      
      // Model configuration
      "model": string,
      "temperature": number,
      "maxTokens": number,
      
      // Overrides (optional)
      "modelOverride": string,
      "temperatureOverride": number,
      "disabled": boolean,
      
      // Sandbox (optional)
      "sandbox": {
        "strategy": "none" | "sandboxExec" | "bwrap" | "custom",
        "profile": string,
        "args": string[],
        "template": string
      }
    }
  }
}
```

### Default Templates

See [README.md](../README.md#-built-in-agent-templates) for the built-in templates (ghost, dataweaver, hardline).

### Example: Custom Agent Template

```json
{
  "agentTemplates": {
    "tester": {
      "id": "tester",
      "name": "TESTER",
      "description": "Test engineer - writes and runs tests",
      "role": "Test Engineer",
      "systemPrompt": "You are TESTER, the automated testing specialist.\n\nYour role is to:\n- Write comprehensive test suites\n- Execute tests and analyze results\n- Identify edge cases and failure modes\n- Generate test reports",
      "model": "claude-sonnet-4.5",
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
      "model": string,
      "temperature": number,
      "disabled": boolean
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

## Icon Customization

Override any icon/emoji used in the UI.

### Schema

See [ICONS.md](./ICONS.md) for the complete list of customizable icons.

### Example

```json
{
  "icons": {
    "modePlan": "🔍",
    "modeBuild": "🔨",
    "agentGhost": "🥷",
    "agentPlanner": "📐",
    "swarm": "🐝",
    "success": "✔️",
    "error": "❗"
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
    "profile": string,
    "args": string[],
    "template": string,
    "policy": {
      "enabled": boolean,
      "network": {
        "allowedDomains": string[],
        "deniedDomains": string[]
      },
      "filesystem": {
        "allowWrite": string[],
        "denyRead": string[],
        "denyWrite": string[]
      }
    }
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

### Example: Sandbox Policy Overrides

```json
{
  "sandbox": {
    "policy": {
      "network": {
        "allowedDomains": [
          "example.com",
          "api.example.com"
        ],
        "deniedDomains": [
          "malicious.com"
        ]
      },
      "filesystem": {
        "allowWrite": [
          "./logs",
          "/tmp/dispatch"
        ],
        "denyRead": [
          "~/secrets"
        ]
      }
    }
  }
}
```

---

## Complete Configuration Example

Full configuration showing all available options:

```json
{
  "slots": {
    "plan_mode": {
      "model": "claude-opus-4.6",
      "thinking": "high",
      "tools": ["read", "find_files"]
    },
    "build_mode": {
      "model": "claude-sonnet-4.5",
      "thinking": "high",
      "tools": ["read", "write", "edit", "bash", "find_files"]
    },
    "assistant": {
      "model": "gpt-4o-mini"
    }
  },
  
  "teams": {
    "enabled": true,
    "defaultThinking": "medium",
    "modelPolicy": {
      "default": "claude-sonnet-4.5",
      "fallback": true,
      "strict": false,
      "overrides": {
        "leader": "claude-opus-4.6",
        "task_planning": "claude-opus-4.6",
        "task_execution": "claude-sonnet-4.5",
        "review": "claude-opus-4.6",
        "research": "gpt-4o-mini"
      },
      "memberOverrides": {
        "alice": "claude-opus-4.6"
      }
    }
  },
  
  "agentTemplates": {
    "ghost": {
      "id": "ghost",
      "name": "GHOST",
      "description": "Implementation specialist",
      "role": "Plan Executor",
      "systemPrompt": "You are GHOST...",
      "model": "claude-sonnet-4.5",
      "temperature": 0.1,
      "maxTokens": 4000,
      "tools": ["file_read", "file_write", "file_edit", "shell_exec"],
      "canWrite": true,
      "canExecuteShell": true,
      "sandbox": {
        "strategy": "sandboxExec"
      }
    }
  },
  
  "agents": {
    "ghost": {
      "model": "anthropic/claude-3-5-sonnet-20240620",
      "temperature": 0.05
    }
  },
  
  "icons": {
    "modePlan": "🔍",
    "modeBuild": "🔨",
    "agentGhost": "🥷"
  },
  
  "sandbox": {
    "strategy": "sandboxExec"
  }
}
```

---

## Configuration Priority

Configuration is resolved from:

1. **User config file** (`~/.pi/agent/extensions/dispatch.json`)
2. **Built-in defaults** (lowest)

---

## Validation

Invalid configurations are reported on startup:

```bash
pi
# ⚠  cmd.exe: Invalid config at slots.plan_mode.model: must be a string
# ⚠  cmd.exe: Unknown agent template: "invalid-agent"
```

---

## Tips

### Performance Optimization

Use cheaper/faster models for background work:

```json
{
  "slots": {
    "assistant": {
      "model": "gpt-4o-mini"
    }
  }
}
```

### Cost Control

Reserve expensive models for complex reasoning:

```json
{
  "slots": {
    "plan_mode": {
      "model": "claude-opus-4.6",
      "thinking": "high"
    },
    "build_mode": {
      "model": "claude-sonnet-4.5"
    },
    "assistant": {
      "model": "gpt-4o-mini"
    }
  }
}
```

### Multi-Machine Setup

Create a user-wide config that works on all your machines:

```json
{
  "slots": {
    "plan_mode": { "model": "gpt-4o" },
    "build_mode": { "model": "gpt-4o-mini" },
    "assistant": { "model": "gpt-4o-mini" }
  }
}
```

Model matching is flexible - suffix matches work across providers.

---

## See Also

- [ICONS.md](./ICONS.md) - Icon customization details
- [README.md](../README.md) - Main documentation
- [AGENTS.md](../AGENTS.md) - Agent system documentation
