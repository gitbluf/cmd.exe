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
      "thinking": "low"
    },
    "assistant": {
      "model": "github-copilot/gpt-5.4-mini"
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
      "thinking"?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max",
      "tools"?: string[]
    },
    "build_mode": {
      "model": string,
      "thinking"?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max",
      "tools"?: string[]
    },
    "assistant": {
      "model": string,
      "thinking"?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
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
      "model": "github-copilot/gpt-5.4-mini"
    }
  }
}
```
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

The sandbox uses one lazy Gondolin VM per Pi session. The footer reports the current lifecycle state: `VM lazy` before first use, `VM creating` during `VM.create()`, `VM up` after successful creation, `VM down` after shutdown/reset, and `VM failed` when creation fails. A failure remains visible until the next successful startup. Disabled configuration and `--no-sandbox` are shown as `VM disabled`; unsupported platforms are shown as `VM unsupported`. If bundled custom assets are present, cmd.exe loads them automatically; otherwise Gondolin provisions its default guest image through the SDK when the VM starts.

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

If `sandbox.imagePath` is omitted, cmd.exe loads VM runtime settings from these optional files:

- Global: `~/.pi/agent/extensions/agent-vm.json` (beside the plugin's `dispatch.json` configuration)
- Project: `<project-root>/agent-vm.json`

The effective precedence is **project VM config → global VM config → default VM settings**. In other words, project `cmdExe.runtime` values override global values, and global values override defaults. Explicit `sandbox` settings in `dispatch.json` remain the highest-priority overrides. The supported runtime values are `cmdExe.runtime.imagePath`, `cmdExe.runtime.memory`, and `cmdExe.runtime.cpus`.

Relative asset paths from the project VM config resolve from the project root. If no configuration specifies an image, packaged assets in `src/sandbox/assets/` or `dist/sandbox/assets/` are detected when present. Invalid paths fail during VM startup instead of silently using the default image.

Create `agent-vm.json` at either location using Gondolin's native build schema. cmd.exe-specific runtime policy lives under `cmdExe`:

```json
{
  "arch": "aarch64",
  "distro": "alpine",
  "alpine": {
    "version": "3.23.0",
    "rootfsPackages": ["linux-virt", "bash", "git", "nodejs", "npm"]
  },
  "rootfs": { "sizeMb": 4096 },
  "cmdExe": {
    "runtime": {
      "imagePath": ".agents/sandbox-vm/agent-vm-assets",
      "memory": "4G",
      "cpus": 4
    }
  }
}
```

The current Gondolin SDK consumes generated assets but does not expose an image-builder API. When `cmdExe.runtime.imagePath` points to missing assets, normal execution fails rather than silently using a smaller default image. `/init --rebuild` is the explicit exception: it validates the project-native build fields from `<project-root>/agent-vm.json`, invokes the Gondolin CLI on a temporary native config, and atomically replaces the project `cmdExe.runtime.imagePath`. If the CLI is unavailable, it reports npm, Bun, and Deno installation commands.

`/init` starts the current VM on demand. `/init --rebuild` builds assets from `agent-vm.json`, `/init --shutdown` stops it, and `/init --destroy` removes the transient VM state. Use `/init --destroy --assets` to additionally delete the configured workspace-local image assets; `agent-vm.json` is preserved. `--no-sandbox` is the only direct-host execution path.

### Image tools

Install guest tools during the Gondolin image build with native `postBuild` commands. This keeps the image reproducible and avoids consuming the small runtime rootfs:

```json
{
  "alpine": {
    "rootfsPackages": ["curl", "ca-certificates"]
  },
  "postBuild": {
    "commands": [
      "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/tags/v0.44.0/install.sh | sh"
    ]
  }
}
```

Run `/init --rebuild` after changing image packages or post-build commands. Tools installed this way are available through the normal guest `PATH`. For GNU-only binaries such as the RTK release installer, use an OCI glibc rootfs instead of Alpine/musl:

```json
{
  "distro": "alpine",
  "oci": {
    "image": "debian:bookworm-slim",
    "runtime": "docker",
    "platform": "linux/arm64"
  }
}
```

The OCI build requires Docker or Podman on the host.

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
    "enabled": true,
    "allowedHosts": ["github.com", "api.github.com"],
    "filesystem": {
      "denyRead": [".ssh", ".aws", ".gnupg"],
      "denyWrite": [".env", ".env.*", "*.pem", "*.key"]
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
