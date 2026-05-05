# Configuration Reference

This document describes the configuration that is actually used by the `cmd.exe` extension.

## Config File Location

```bash
~/.pi/agent/extensions/dispatch.json
```

---

## Top-level Keys

Only these top-level keys are relevant for the extension:

- `slots`
- `rtk_enabled`
- `teams`
- `agentTemplates`
- `agents`
- `icons`
- `sandbox`

---

## Minimal Working Config

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

---

## 1) Slots (`slots`)

Controls model/tool behavior for Plan mode, Build mode, and assistant sub-agents.

### Schema

```ts
{
  "slots": {
    "plan_mode": {
      "model": string,
      "thinking"?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
      "tools"?: string[]
    },
    "build_mode": {
      "model": string,
      "thinking"?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
      "tools"?: string[]
    },
    "assistant": {
      "model": string,
      "thinking"?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
    }
  }
}
```

### Defaults

```json
{
  "slots": {
    "plan_mode": {
      "model": "github-copilot/claude-sonnet-4.5",
      "tools": ["read", "find_files"]
    },
    "build_mode": {
      "model": "github-copilot/claude-sonnet-4.5",
      "thinking": "high",
      "tools": ["read", "write", "edit", "bash", "find_files"]
    },
    "assistant": {
      "model": "github-copilot/gpt-4o-mini"
    }
  }
}
```

### Notes

- `/plan` toggles between `plan_mode` and `build_mode`.
- `/ask` uses the current mode slot.
- `find_files` uses the `assistant` slot.
- Model matching supports exact, provider/id, and suffix matching.

---

## 2) RTK toggle (`rtk_enabled`)

Enables RTK bash command prefixing support.

### Schema

```ts
{
  "rtk_enabled"?: boolean
}
```

### Behavior

- Default: `false`
- If `true` and `rtk` exists in PATH, supported bash commands are rewritten to `rtk <command>`.
- If `true` but `rtk` is not in PATH, it falls back to normal bash execution.
- Runtime toggle command: `/rtk`

### Example

```json
{
  "rtk_enabled": true
}
```

---

## 3) Teams config (`teams`)

Controls team model policy behavior used by team commands/tools.

### Schema

```ts
{
  "teams"?: {
    "enabled"?: boolean,
    "defaultThinking"?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
    "modelPolicy"?: {
      "default"?: string,
      "overrides"?: Partial<Record<
        | "leader"
        | "teammate_default"
        | "delegate"
        | "task_planning"
        | "task_execution"
        | "review"
        | "research"
        | "message_summarization"
        | "hooks",
        string
      >>,
      "memberOverrides"?: Record<string, string>,
      "fallback"?: boolean,
      "strict"?: boolean,
      "disallowDeprecatedInheritance"?: boolean
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

---

## 4) Agent templates (`agentTemplates`)

Defines agent templates used for swarm/sub-agent execution.

### Schema

```ts
{
  "agentTemplates"?: {
    "[agentId]": {
      "id"?: string,
      "name"?: string,
      "agentType"?: "cortex" | "blueprint" | "dataweaver" | "ghost" | "hardline",
      "role": string,
      "description": string,
      "systemPrompt": string,
      "tools": string[],
      "canWrite"?: boolean,
      "canExecuteShell"?: boolean,
      "readOnlyBash"?: boolean,
      "model": string,
      "maxTokens": number,
      "temperature": number,
      "modelOverride"?: string,
      "temperatureOverride"?: number,
      "disabled"?: boolean,
      "sandbox"?: {
        "strategy"?: "none" | "sandboxExec" | "bwrap" | "custom",
        "profile"?: string,
        "args"?: string[],
        "template"?: string
      }
    }
  }
}
```

### Runtime defaults

Default-loaded templates are:

- `ghost`
- `dataweaver`
- `hardline`

---

## 5) Per-agent overrides (`agents`)

Lightweight overrides on top of templates.

### Schema

```ts
{
  "agents"?: {
    "[agentId]": {
      "model"?: string,
      "temperature"?: number,
      "disabled"?: boolean
    }
  }
}
```

### Example

```json
{
  "agents": {
    "ghost": {
      "model": "github-copilot/claude-sonnet-4.5",
      "temperature": 0.05
    },
    "hardline": {
      "disabled": true
    }
  }
}
```

---

## 6) Icons (`icons`)

Override UI icons used by the extension.

### Schema

```ts
{
  "icons"?: Partial<IconSet>
}
```

See [`docs/ICONS.md`](./ICONS.md) for all supported icon keys.

---

## 7) Sandbox (`sandbox`)

Controls sandbox strategy/policy used by extension workflows.

### Schema

```ts
{
  "sandbox"?: {
    "strategy"?: "none" | "sandboxExec" | "bwrap" | "custom",
    "profile"?: string,
    "args"?: string[],
    "template"?: string,
    "policy"?: {
      "enabled"?: boolean,
      "network"?: {
        "allowedDomains"?: string[],
        "deniedDomains"?: string[]
      },
      "filesystem"?: {
        "allowWrite"?: string[],
        "denyRead"?: string[],
        "denyWrite"?: string[]
      }
    }
  }
}
```

### Default policy

- Network allowlist includes GitHub domains.
- Sensitive paths like `~/.ssh`, `~/.aws`, `~/.gnupg` are denied for reads.

---

## Complete Example (Current)

```json
{
  "rtk_enabled": true,
  "slots": {
    "plan_mode": {
      "model": "github-copilot/claude-sonnet-4.5",
      "tools": ["read", "find_files"]
    },
    "build_mode": {
      "model": "github-copilot/claude-sonnet-4.5",
      "thinking": "high",
      "tools": ["read", "write", "edit", "bash", "find_files"]
    },
    "assistant": {
      "model": "github-copilot/gpt-4o-mini"
    }
  },
  "teams": {
    "defaultThinking": "medium",
    "modelPolicy": {
      "default": "github-copilot/claude-sonnet-4.5",
      "fallback": true,
      "strict": false,
      "overrides": {
        "task_planning": "github-copilot/claude-sonnet-4.5",
        "task_execution": "github-copilot/claude-sonnet-4.5",
        "research": "github-copilot/gpt-4o-mini"
      }
    }
  },
  "agents": {
    "hardline": {
      "disabled": false
    }
  },
  "icons": {
    "modePlan": "⚡",
    "modeBuild": "🚀"
  },
  "sandbox": {
    "policy": {
      "network": {
        "allowedDomains": ["github.com", "api.github.com"]
      }
    }
  }
}
```

---

## Legacy Compatibility

The loader still auto-migrates deprecated legacy keys:

- `modelConfig`
- `modes`

Prefer `slots` for new configs.

---

## See also

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [ICONS.md](./ICONS.md)
