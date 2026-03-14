# Icon Configuration

The icon system provides centralized configuration for all icons/emojis used throughout the extension.

## Overview

All icons are defined in `src/ui/icons.ts` with sensible defaults. Users can override any icon via the `icons` field in their `dispatch.json` configuration file.

## Default Icons

```typescript
{
  // Status indicators
  success: "✅",
  error: "❌",
  warning: "⚠",
  pending: "⏳",
  running: "🔄",
  timeout: "⏱️",
  cancelled: "⊘",
  check: "✓",
  cross: "✗",

  // Mode indicators
  modePlan: "⚡",
  modeBuild: "☠️",

  // Agent indicators
  agentBlackice: "👁️",
  agentGhost: "👻",
  agentPlanner: "🧠",
  agentDataweaver: "🕸️",
  agentDefault: "⚙️",

  // Feature indicators
  sandbox: "🔒",
  tool: "🔧",
  swarm: "🐝",
  dispatch: "⚡",
  jack: "🔌",
  net: "📡",
  code: "💻",
  branch: "🌿",
  lock: "🔒",

  // Decorators
  dot: "●",
  arrow: "→",
  spark: "⚡",

  // Dashboard status (compact single-char)
  statusPending: "○",
  statusRunning: "◉",
  statusComplete: "✓",
  statusFailed: "✗",
  statusTimeout: "⏱",
  statusCancelled: "⊘"
}
```

## Configuration

Override icons in `~/.pi/agent/extensions/dispatch.json`:

```json
{
  "icons": {
    "modePlan": "🔍",
    "modeBuild": "🔨",
    "swarm": "🐝",
    "agentGhost": "🥷",
    "success": "✓",
    "error": "✗"
  }
}
```

Only include the icons you want to override. All other icons will use defaults.

## Usage in Code

### For new code

Import and use the icon registry:

```typescript
import { getIconRegistry } from "../ui/icons";

const icons = getIconRegistry();
console.log(`${icons.success} Task completed!`);
```

### For legacy code

The old `ICONS` object from `ui/components.ts` still works via getters:

```typescript
import { ICONS } from "../ui";

console.log(ICONS.check); // Still works!
```

## Icon Categories

### Status Icons
Used for task/operation status indicators:
- `success`, `error`, `warning` - Full emoji status
- `check`, `cross` - Compact text status
- `pending`, `running`, `timeout`, `cancelled` - Workflow states

### Mode Icons
Used for Plan/Build mode indicators:
- `modePlan` - Footer indicator for Plan mode
- `modeBuild` - Footer indicator for Build mode

### Agent Icons
Used for agent identification:
- `agentBlackice` - BLACKICE orchestrator
- `agentGhost` - GHOST implementation agent
- `agentPlanner` - Plan agent indicator
- `agentDataweaver` - DATAWEAVER reconnaissance agent
- `agentDefault` - Generic sub-agent fallback

### Feature Icons
Used for system features:
- `sandbox` - Sandbox status in footer
- `tool` - Tool execution markers
- `swarm` - Swarm operations
- `dispatch` - Dispatch dashboard

### Dashboard Icons
Compact single-character icons used in table views:
- `statusPending` - ○
- `statusRunning` - ◉
- `statusComplete` - ✓
- `statusFailed` - ✗
- `statusTimeout` - ⏱
- `statusCancelled` - ⊘

## Icon Registry Initialization

The icon registry is initialized once during extension load:

```typescript
// src/index.ts
export default function (pi: ExtensionAPI) {
  const config = loadConfig(configPath);
  
  // Initialize icons with user overrides
  initIcons(config.icons);
  
  // ... rest of setup
}
```

After initialization, `getIconRegistry()` returns the frozen icon set with all user overrides applied.
