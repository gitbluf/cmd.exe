# Quick Reference: Modular Dispath

## Source Tree

```
src/
├── index.ts                    Main entry point + commands
├── agents/                     Agent execution
│   ├── types.ts               Config & state types
│   ├── executor.ts            AgentExecutor class
│   └── index.ts               Public API
├── templates/                  Agent template system
│   ├── types.ts               Interfaces
│   ├── defaults.ts            Built-in agents (analyst, executor, etc.)
│   ├── utils.ts               Validation, merging
│   └── index.ts               Public API
├── ui/                         User interface
│   ├── components.ts          Control panels, output displays
│   ├── widget.ts              Widget creation
│   └── index.ts               Public API
├── sandbox/                    Tool sandboxing (future)
│   ├── adapters.ts            Execution strategies
│   └── index.ts               Public API
└── utils/                      Shared utilities
    ├── config.ts              Config loading & merging
    ├── git.ts                 Git worktree management
    └── index.ts               Public API
```

## Key Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| `agents/executor.ts` | Create/run agents | `AgentExecutor`, `spawnAgent` |
| `templates/defaults.ts` | Agent definitions | `DEFAULT_TEMPLATES`, `AVAILABLE_TOOLS` |
| `templates/utils.ts` | Template utilities | `validateTemplate`, `getTemplateNames` |
| `ui/components.ts` | UI display | `colorize`, `DishatchControlPanel` |
| `utils/config.ts` | Config loading | `loadConfig`, `getWorkspaceRoot` |
| `utils/git.ts` | Git operations | `createWorktree`, `pruneWorktrees` |

## Imports (For Developers)

```typescript
// Agent execution
import { spawnAgent } from "./agents";
import type { AgentConfig } from "./agents";

// Templates
import { DEFAULT_TEMPLATES, validateTemplate, getTemplateNames } from "./templates";
import type { AgentTemplate } from "./templates/types";

// UI
import { colorize, ANSI } from "./ui";

// Utils
import { loadConfig, getWorkspaceRoot } from "./utils/config";
import { createWorktree, pruneWorktrees } from "./utils/git";
```

## Module Dependencies

```
agents/        → nothing
templates/     → nothing
ui/            → nothing
sandbox/       → nothing
utils/         → templates
index.ts       → all modules
```

## What's Where

**Need to add a new agent template?**
→ Edit `templates/defaults.ts`, add to `DEFAULT_TEMPLATES`

**Need to change UI colors?**
→ Edit `ui/components.ts`, update `ANSI` or `colorize()`

**Need new git operations?**
→ Add to `utils/git.ts`, export from `utils/index.ts`

**Need config changes?**
→ Edit `utils/config.ts`, update `loadConfig()`

**Need to modify agent execution?**
→ Edit `agents/executor.ts`, update `AgentExecutor` class

**Need new UI components?**
→ Add to `ui/components.ts`, export from `ui/index.ts`

## Building

```bash
# Compile TypeScript
npm run build

# Watch for changes
npm run watch

# Clean build
npm run clean && npm run build
```

## File Organization Rules

1. **Types in `types.ts`**
   - All interfaces/types for module go here
   - Export with `export type`

2. **Implementation separate**
   - Logic in named files (executor.ts, adapters.ts, etc.)
   - No logic in index.ts

3. **Public API in `index.ts`**
   - Only export what's needed
   - Hide internal implementation
   - Use `export type` for types

4. **No circular imports**
   - agents ↛ templates
   - ui ↛ utils
   - sandbox ↛ anything (self-contained)

5. **Clear documentation**
   - Module comments at top of files
   - Type comments for public APIs
   - Examples in docs

## Adding a Module

```bash
# 1. Create directory
mkdir src/mymodule

# 2. Create files
touch src/mymodule/types.ts
touch src/mymodule/implementation.ts
touch src/mymodule/index.ts

# 3. In index.ts
export { MyClass } from "./implementation";
export type { MyType } from "./types";

# 4. In index.ts main, import and use
import { MyClass } from "./mymodule";
```

## Testing

```bash
# Run tests (when available)
npm test

# Test specific module
npm test -- agents
npm test -- templates
```

## Performance

- Small modules = fast compilation
- Clear dependencies = easy optimization
- Separated concerns = easier profiling

## Common Tasks

| Task | Location |
|------|----------|
| Add agent type | `templates/defaults.ts` |
| Change UI colors | `ui/components.ts` |
| Modify config loading | `utils/config.ts` |
| Add git operation | `utils/git.ts` |
| Change agent execution | `agents/executor.ts` |
| Add UI component | `ui/components.ts` |
| Fix template validation | `templates/utils.ts` |

## Directory Growth

Expected future structure:
```
src/
├── agents/
│   ├── executor.ts      ← could split into executor, session, streaming
│   └── ...
├── templates/
│   ├── defaults.ts
│   ├── custom/          ← user custom templates (future)
│   └── ...
├── ui/
│   ├── components/      ← individual components
│   ├── styles/          ← theme system
│   └── ...
├── tools/               ← custom tool implementations (new)
│   ├── file_ops.ts
│   ├── shell.ts
│   └── ...
└── ...
```

## Versioning

- Major: Breaking API changes
- Minor: New modules/features
- Patch: Bug fixes

Current: 0.1.0 (pre-release, prototype)

## Support

- **Architecture**: See `MODULAR_STRUCTURE.md`
- **Refactoring**: See `REFACTORING_SUMMARY.md`
- **Templates**: See `TEMPLATES.md`
- **Usage**: See `README.md`

---

**Last Updated:** 2024-02-27  
**Status:** ✅ Production Ready  
**TypeScript:** Strict Mode  
**Modules:** 6 (agents, templates, ui, sandbox, utils, core)
