# Modular Architecture

## Overview

Dispath has been refactored into a clean **modular component structure** where each component lives in its own directory with clear dependencies.

## Directory Structure

```
src/
├── index.ts              ← Main extension entry point
├── agents/               ← Agent execution module
│   ├── index.ts
│   ├── types.ts
│   └── executor.ts
├── templates/            ← Template system module
│   ├── index.ts
│   ├── types.ts
│   ├── defaults.ts
│   └── utils.ts
├── ui/                   ← UI components module
│   ├── index.ts
│   ├── components.ts
│   └── widget.ts
├── sandbox/              ← Tool sandboxing module
│   ├── index.ts
│   └── adapters.ts
└── utils/                ← Utilities module
    ├── index.ts
    ├── config.ts
    └── git.ts
```

## Module Descriptions

### `agents/` - Agent Execution
Handles spawning and managing AI agent sessions.

**Files:**
- `types.ts` - Agent configuration and state types
- `executor.ts` - AgentExecutor class that creates pi SDK sessions
- `index.ts` - Public API exports

**Key Exports:**
```typescript
export { AgentExecutor, spawnAgent } from "./executor";
export type { AgentConfig, AgentSessionState, AgentEventCallbacks } from "./types";
```

**Used By:** `index.ts`

---

### `templates/` - Agent Templates
Defines agent personality types and configuration.

**Files:**
- `types.ts` - TypeScript interfaces (AgentTemplate, TemplateConfig)
- `defaults.ts` - Built-in agent definitions and tool specs
- `utils.ts` - Template utilities (merge, validate, query)
- `index.ts` - Public API exports

**Key Exports:**
```typescript
export const DEFAULT_TEMPLATES: Record<string, AgentTemplate>;
export const AVAILABLE_TOOLS: Record<string, ToolDefinition>;
export { mergeTemplates, validateTemplate, getTemplateNames, ... };
```

**Features:**
- 5 built-in types: analyst, executor, researcher, auditor, architect
- Type-safe template definitions
- Validation and merge logic
- Utility functions for listing and random selection

**Used By:** `utils/config.ts`, `index.ts`

---

### `ui/` - User Interface Components
Display components, styling, and widget creation.

**Files:**
- `components.ts` - DishatchControlPanel, AgentOutputPanel
- `widget.ts` - Widget creation and event handling
- `index.ts` - Public API exports

**Key Exports:**
```typescript
export { DishatchControlPanel, AgentOutputPanel };
export { ANSI, ICONS, colorize, stripAnsi, formatStatus, separator };
export { createWidget };
```

**Features:**
- ANSI color formatting (cyan, magenta, red, green, etc.)
- Cyberpunk-themed icons and styling
- Control panels for tracking agent status
- Event-based widget updates

**Used By:** `index.ts`

---

### `sandbox/` - Tool Sandboxing
Strategies for executing tools safely.

**Files:**
- `adapters.ts` - Execution wrappers (none, sandbox-exec, bwrap, custom)
- `index.ts` - Public API exports

**Key Exports:**
```typescript
export const adapters = {
  none: { wrap: ... },
  sandboxExec: { wrap: ... },
  bwrap: { wrap: ... },
  custom: { wrap: ... }
};
```

**Features:**
- Multiple sandboxing strategies
- Shell escaping utilities
- Configurable execution wrapping

**Used By:** Future tool implementations

---

### `utils/` - Utility Functions
Shared utilities for git operations and configuration.

**Files:**
- `config.ts` - Configuration loading and merging
- `git.ts` - Git worktree management
- `index.ts` - Public API exports

**Key Exports:**
```typescript
// Config
export { loadConfig, loadConfigFile, saveConfig, getConfigPath, getWorkspaceRoot };

// Git
export { execGit, pruneWorktrees, listWorktrees, removeWorktree, ... };
```

**Features:**
- Configuration file loading with JSON merging
- Git worktree lifecycle management
- Branch cleanup and pruning
- GPG signing configuration

**Used By:** `index.ts`

---

## Dependency Graph

```
index.ts (main)
  ├── agents/
  │   └── types.ts
  ├── templates/
  │   ├── types.ts
  │   ├── defaults.ts
  │   └── utils.ts
  ├── ui/
  │   ├── components.ts
  │   └── widget.ts
  ├── sandbox/ (future use)
  │   └── adapters.ts
  └── utils/
      ├── config.ts
      │   └── templates/types.ts
      └── git.ts
```

## Import Style

Each module exports its public API through an `index.ts`:

```typescript
// ✅ Good - import from module, gets all exports
import { spawnAgent } from "./agents";
import type { AgentConfig } from "./agents";

// ✅ Also good - import types from types file directly
import type { AgentTemplate } from "./templates/types";

// ❌ Avoid - importing internal implementation files
import { AgentExecutor } from "./agents/executor"; // Instead use "./agents"
```

## Adding New Components

To add a new component:

1. **Create directory:** `src/mycomponent/`
2. **Create files:**
   - `index.ts` - Public API exports only
   - `types.ts` - TypeScript interfaces (if needed)
   - `implementation.ts` - Actual implementation
3. **Export public API:**
   ```typescript
   // src/mycomponent/index.ts
   export { MyClass, myFunction } from "./implementation";
   export type { MyInterface } from "./types";
   ```
4. **Update main:**
   ```typescript
   // src/index.ts
   import { MyClass } from "./mycomponent";
   ```

## Module Isolation

Each module:
- **Has clear responsibilities** - Single purpose, tightly focused
- **Exports a clean API** - Only public interfaces through index.ts
- **Manages own state** - No shared globals
- **Declares dependencies** - Clear imports at module level
- **Avoids circular deps** - No A imports B imports A

## Type Safety

- **TypeScript interfaces** - All public APIs have types
- **Strict mode enabled** - No implicit any
- **Type exports** - Types exported separately with `export type`
- **Validation** - Templates and configs validated at load time

## Building & Distribution

```bash
# Build TypeScript to JavaScript
npm run build

# Output structure
dist/
├── agents/
│   ├── index.d.ts
│   ├── index.js
│   ├── types.d.ts
│   ├── executor.d.ts
│   └── executor.js
├── templates/
│   ├── index.d.ts
│   └── ...
├── ui/
│   ├── index.d.ts
│   └── ...
├── utils/
│   ├── index.d.ts
│   └── ...
├── index.d.ts
└── index.js
```

Each module compiles to its own directory with `.d.ts` type declarations.

## Benefits of Modular Structure

✅ **Clarity** - Each file has one job  
✅ **Reusability** - Components can be used independently  
✅ **Testability** - Modules can be tested in isolation  
✅ **Maintainability** - Changes are localized  
✅ **Documentation** - Clear structure is self-documenting  
✅ **Scalability** - Easy to add new components  
✅ **Type Safety** - Strong typing throughout  

## Future Improvements

- [ ] Unit tests per module
- [ ] Module-level documentation
- [ ] Public/private API enforcement
- [ ] Component dependency visualization
- [ ] Module performance metrics
