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

## 2) Icons (`icons`)

Override UI icons used by the extension.

### Schema

```ts
{
  "icons"?: Partial<IconSet>
}
```

See [`docs/ICONS.md`](./ICONS.md) for all supported icon keys.

---

## 3) Sandbox (`sandbox`)

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

## RTK Extension Detection

cmd.exe automatically detects whether the official RTK pi extension (`rtk.ts`) is loaded in the session. When detected, an RTK status indicator appears in the footer.

Command rewriting is handled entirely by the RTK extension — no configuration is required in `dispatch.json`.

---

## Complete Example (Current)

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
