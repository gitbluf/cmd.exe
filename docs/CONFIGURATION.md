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
- `web_search`
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
- `web_search` must be added to a mode's `tools` list before the main agent can call it.
- Model matching supports exact, provider/id, and suffix matching.
- If a slot omits `thinking`, cmd.exe falls back to that slot's default thinking behavior.
- If a provider does not support the requested thinking level, or applying it fails, cmd.exe warns instead of failing silently.

---

## 2) Web Search (`web_search`)

Configures the optional `web_search` tool. When enabled, `web_search` spawns an isolated sub-agent like `find_files`, but the sub-agent receives only the tool names listed in `web_search.tools`. This is intended for arbitrary MCP-provided search/fetch tools.

`web_search` is not registered when `web_search.tools` is missing or empty. To make the main agent able to call it, also include `"web_search"` in the desired `slots.plan_mode.tools` and/or `slots.build_mode.tools` list.

### Schema

```ts
{
  "web_search"?: {
    "tools": string[],
    "model"?: string,
    "thinking"?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  }
}
```

### Example

```json
{
  "slots": {
    "plan_mode": {
      "model": "github-copilot/claude-sonnet-4.5",
      "tools": ["read", "find_files", "web_search"]
    },
    "build_mode": {
      "model": "github-copilot/claude-sonnet-4.5",
      "thinking": "high",
      "tools": ["read", "write", "edit", "bash", "find_files", "web_search"]
    },
    "assistant": {
      "model": "github-copilot/gpt-4o-mini"
    }
  },
  "web_search": {
    "tools": ["brave_search", "fetch_url"],
    "model": "github-copilot/gpt-4o-mini",
    "thinking": "low"
  }
}
```

### Notes

- `web_search.tools` are passed directly to the sub-agent as allowed tools.
- Tool names can be any registered tools, including MCP tools.
- `web_search.model` and `web_search.thinking` override the `assistant` slot for this tool only.
- If `web_search.model` is omitted, the tool uses the `assistant` slot model.
- If `web_search.thinking` is omitted, the tool uses the `assistant` slot thinking level.

---

## 3) Icons (`icons`)

Override UI icons used by the extension.

### Schema

```ts
{
  "icons"?: Partial<IconSet>
}
```

See [`docs/ICONS.md`](./ICONS.md) for all supported icon keys.

---

## 4) Sandbox (`sandbox`)

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

- Network allowlist includes GitHub domains, including `api.github.com` for REST and GraphQL calls.
- Network allowlist also includes common macOS/GitHub TLS certificate validation hosts such as DigiCert OCSP/CRL endpoints and Apple trust validation endpoints. These are required by tools like `gh` when verifying `https://api.github.com/graphql` certificates inside the sandbox.
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
      "tools": ["read", "find_files", "web_search"]
    },
    "build_mode": {
      "model": "github-copilot/claude-sonnet-4.5",
      "thinking": "high",
      "tools": ["read", "write", "edit", "bash", "find_files", "web_search"]
    },
    "assistant": {
      "model": "github-copilot/gpt-4o-mini"
    }
  },
  "web_search": {
    "tools": ["brave_search", "fetch_url"],
    "model": "github-copilot/gpt-4o-mini",
    "thinking": "low"
  },
  "icons": {
    "modePlan": "⚡",
    "modeBuild": "🚀"
  },
  "sandbox": {
    "policy": {
      "network": {
        "allowedDomains": [
          "github.com",
          "api.github.com",
          "ocsp.digicert.com",
          "crl3.digicert.com",
          "crl4.digicert.com",
          "cacerts.digicert.com",
          "ocsp.apple.com",
          "valid.apple.com"
        ]
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
