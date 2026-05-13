# Spec: `/agent:new` (V1) — Spawn Forked PI Session in New CMUX Surface

## Status
Draft (V1, surface-based)

## Goal
Add `/agent:new` that creates a **new CMUX terminal surface** and launches a new `pi` instance from a **fork of the current session**.

---

## Key Decisions

1. `/agent:new` is available only when running inside CMUX (`CMUX_WORKSPACE_ID` or `CMUX_SURFACE_ID` present).
2. Spawn target is a **new surface** (not a window).
3. Fork bootstrap uses native pi CLI: `pi --fork <sessionFile>`.
4. Fork source uses persisted current session file: `ctx.sessionManager.getSessionFile()`.
5. Thinking level is always passed explicitly (including `off`) to prevent child default drift.

---

## Confirmed API/CLI Constraints

- **pi CLI:**
  - `--fork <path|id>` supported natively.
  - `--model`, `--thinking`, `--tools` accepted for capability parity.
  - No `unregisterCommand` in Extension API — command must be conditionally registered at startup.
- **CMUX CLI:**
  - `new-surface --type terminal --focus true [--workspace <id>] --id-format both` creates a surface.
  - `send --surface <ref> <text>` sends a command string to a surface.
  - `send-key --surface <ref> Enter` executes it.
  - `CMUX_WORKSPACE_ID` and `CMUX_SURFACE_ID` are auto-set in CMUX terminals.

---

## V1 Scope

### Functional Requirements

1. Command name: `/agent:new`.
2. Registration gating:
   - register only if `CMUX_WORKSPACE_ID` or `CMUX_SURFACE_ID` is present in env.
   - no runtime toggle; gating is a one-time check at extension startup.
3. Spawn target: new CMUX terminal surface in current workspace.
4. Child startup: `pi --fork <currentSessionFile>`.
5. Working directory: child surface starts with `cd -- <cwd>` prepended to launch command.
6. Capability parity:
   - `--model <provider/id>` from `ctx.model`
   - `--thinking <level>` always (including `off`) from `pi.getThinkingLevel()`
   - `--tools <comma-list>` from `pi.getActiveTools()`
7. UX:
   - pending notification on start
   - success notification with surface ref
   - actionable failure per-stage

### Non-Goals (V1)
- No custom transcript/payload transfer beyond `--fork`.
- No pane-level splitting (surface only).
- No runtime show/hide of `/agent:new` based on CMUX attach/detach.

---

## Architecture

### New Files
| File | Purpose |
|------|---------|
| `src/cmux/detection.ts` | `isCmuxSession()` — strong-signal env detection |
| `src/cmux/spawn.ts` | `spawnPiForkInNewSurface()` — CMUX CLI orchestration |
| `src/cmux/index.ts` | Public barrel export |
| `src/commands/handlers/agent-new.ts` | `/agent:new` command handler |
| `docs/specs/agent-new.md` | This file |

### Modified Files
| File | Change |
|------|--------|
| `src/commands/handlers/index.ts` | Export `handleAgentNew` |
| `src/commands/register.ts` | Conditionally register `/agent:new` |

---

## CMUX Command Contract

### 1) Preconditions

- `CMUX_WORKSPACE_ID` or `CMUX_SURFACE_ID` is present in env.
- `ctx.sessionManager.getSessionFile()` returns a non-empty string.

Abort before calling CMUX if either fails.

### 2) Workspace Resolution

Use workspace in this order:
1. `process.env.CMUX_WORKSPACE_ID` (auto-set by CMUX)
2. Omit `--workspace` and let CMUX default-resolve caller workspace

### 3) Child Command Construction

Shell-safe single-quote escaping (`shQuote`) applied to all arguments.

Final command shape sent via `cmux send`:
```
cd -- '<cwd>' && pi '--fork' '<sessionFile>' ['--model' '<id>'] ['--thinking' '<level>'] ['--tools' '<list>']
```

### 4) Surface Creation

```
cmux new-surface --type terminal --focus true [--workspace <id>] --id-format both
```

- `--id-format both` preferred for machine-readable output.
- If `--id-format both` causes failure: retry once without it.
- Non-zero exit → failure at stage `new-surface`.

### 5) Surface Ref Parsing (priority order)

1. `surface:<n>` short-ref token
2. UUID token (`8-4-4-4-12` hex)
3. First non-empty token (fallback)

If nothing parsed → failure at stage `parse-ref` with raw stdout snippet.

### 6) Command Injection

```
cmux send     --surface <ref> [--workspace <id>] "<childCommand>"
cmux send-key --surface <ref> [--workspace <id>] Enter
```

Both must exit `0`. If `send-key` fails after `send` succeeds:
- surface exists but command may not have run → `send-key` stage failure message.

### 7) Timeouts

- Each CMUX call: `10s` (`CMUX_TIMEOUT_MS` constant)
- Retry: one retry only for `new-surface` when `--id-format both` is unsupported
- No retries for `send` / `send-key`

---

## Error Messages

| Stage | Message |
|-------|---------|
| Not in CMUX | `⚠ /agent:new is available only inside CMUX sessions` |
| No session file | `⚠ Current session is ephemeral and cannot be forked. Start or continue a persisted session first.` |
| `new-surface` fail | `❌ [new-surface] Failed to spawn agent: <detail>` |
| `parse-ref` fail | `❌ [parse-ref] Failed to spawn agent: Could not parse surface ref from cmux output: <snippet>` |
| `send` fail | `❌ [send] Failed to spawn agent: <detail>` |
| `send-key` fail | `❌ [send-key] Failed to spawn agent: <detail>` |
| Success | `✅ Forked agent spawned in surface:N` |

---

## Testing Plan (V1)

### Unit
- `cmux/detection.ts`:
  - `CMUX_WORKSPACE_ID` or `CMUX_SURFACE_ID` present → `ok: true`
  - only other `CMUX_*` keys present → `ok: false`, reason set
  - no `CMUX_*` keys → `ok: false`, reason set
- `cmux/spawn.ts`:
  - `shQuote` correctly escapes spaces, `$`, `!`, single quotes
  - `buildChildCommand` prepends `cd -- <cwd> &&`
  - `parseSurfaceRef` parses `surface:<n>`, UUID, fallback token, returns undefined for empty
  - `parse-ref` failure includes stdout snippet
- `agent-new.ts` handler:
  - rejects when `getSessionFile()` is undefined
  - always includes `--thinking` in `piExtraArgs`
  - builds correct `piExtraArgs` from model/thinking/tools

### Integration
- In simulated CMUX env, `/agent:new` appears in `pi.getCommands()`
- Outside CMUX env, `/agent:new` is absent from registered commands
- Spawn adapter calls `new-surface` → `send` → `send-key` in order

### Manual
1. Start pi inside CMUX terminal with a persisted session
2. Run `/agent:new`
3. Verify new surface opens with `cd` to correct cwd and child pi starts forked from parent session

---

## Future (V2)
- Bounded context transfer: last N messages + summary via temp file
- Child bootstrap reads fork payload on `session_start`
- Configurable fork payload limits and truncation policy
