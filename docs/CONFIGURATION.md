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

The sandbox uses one lazy Gondolin VM per Pi session. If bundled custom assets are present, cmd.exe loads them automatically; otherwise Gondolin provisions its default guest image through the SDK when the VM starts.

### Schema

```ts
{
  "sandbox"?: {
    "enabled"?: boolean,
    "allowedHosts"?: string[],
    "secrets"?: Record<string, { "env": string, "hosts": string[] }>,
    "filesystem"?: {
      "denyRead"?: string[],
      "readOnly"?: string[],
      "denyWrite"?: string[]
    },
    "memory"?: string,
    "cpus"?: number,
    "imagePath"?: string
  }
}
```

The workspace is mounted read/write at `/workspace`, including hidden files by default. Paths outside the workspace are rejected. Network access is mediated by Gondolin with internal-range blocking enabled. Secret values stay on the host and are exposed to the guest only as placeholders.

If `sandbox.imagePath` is omitted, cmd.exe first loads the optional `agent-vm.json` from the workspace root. Its `runtime.imagePath`, `runtime.memory`, and `runtime.cpus` values are used automatically; explicit `sandbox` settings in `dispatch.json` take precedence. If neither specifies an image, packaged assets in `src/sandbox/assets/` or `dist/sandbox/assets/` are detected when present. Invalid explicit paths fail during VM startup instead of silently using the default image.

Create `agent-vm.json` at the workspace root with both the Gondolin build definition and SDK runtime settings:

```json
{
  "build": {
    "arch": "aarch64",
    "distro": "alpine",
    "alpine": {
      "rootfsPackages": ["linux-virt", "bash", "git", "nodejs", "npm", "bun"]
    },
    "rootfs": { "sizeMb": 4096 }
  },
  "runtime": {
    "imagePath": ".agents/sandbox-vm/agent-vm-assets",
    "memory": "4G",
    "cpus": 4
  }
}
```

The current Gondolin SDK consumes generated assets but does not expose an image-builder API. `/init --rebuild` instead installs `build.alpine.rootfsPackages` into the active VM using `VM.exec()` and `apk`; these changes persist only for the current COW session. Persistent custom image files must be built separately and referenced by `runtime.imagePath`.

`/init` starts the current VM on demand. `/init --rebuild` rebuilds from `agent-vm.json`, `/init --shutdown` stops it, and `/init --destroy` removes the transient VM state. `--no-sandbox` is the only direct-host execution path.

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
