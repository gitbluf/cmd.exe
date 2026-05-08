# cmd.exe Extension

## Core Commands

### /plan

Toggle between Plan mode (read-only analysis) and Build mode (full implementation).

**Plan Mode:**
- Read-only tools: `read`, `find_files`
- Focuses on analysis, architecture, and planning
- Creates structured plans with numbered steps
- Suggests switching to Build mode for execution

**Build Mode:**
- Full tools: `read`, `write`, `edit`, `bash`, `find_files`
- Executes changes surgically and precisely
- If a plan is active, receives it in the system prompt
- Marks steps complete with `[DONE:n]` tags

### /todos

Show current plan progress. Displays an expanded view of all plan steps with completion status.

**Usage:**

```bash
/todos   # Show plan progress (auto-dismisses after 5 seconds)
```

Plan progress is also always visible in the footer status bar when a plan is active.

### /ask

Ask a one-off question to an LLM without polluting the main conversation context. The session is ephemeral and discarded after the answer.

**Usage:**

```bash
/ask what is the purpose of the dataweaver agent?
/ask how do I configure sandbox mode?
/ask explain the plan tracking system
```

**Features:**
- Ephemeral session (no memory after answer)
- Does not pollute main conversation history
- Default model: `github-copilot/haiku-4.5`
- High thinking level for deeper reasoning
- Falls back to current session model if unavailable
- Read-only file access for context
- Real-time streaming answer in widget
- Widget stays visible after completion
- Automatically dismissed when you send next prompt

**Use cases:**
- Quick factual questions about the codebase
- Checking documentation or configuration
- Getting explanations without derailing main conversation
- Testing a different model's response style

### /plan:save

Save the current active plan to disk.

**Usage:**

```bash
/plan:save
```

**Features:**
- Writes current plan to `.agents/plan-{timestamp}.md`
- Includes progress summary (completed/total steps)
- Shows completion timestamps for finished steps
- Only works when a plan is active

**Output format:**
- Markdown file with plan metadata
- Checklist with ✅ (completed) or ⬜ (pending)
- Timestamp for each completed step

### /rtk

Toggle RTK command prefixing for bash tool execution.

---

## Plan Mode & Plan Tracking

### How Plans Work

Plans are structured, numbered sequences of implementation steps created by the main session in Plan mode.

**Creating a plan:**
- In Plan mode, ask the LLM to create a plan
- The agent outputs numbered steps with a "Plan:" header
- System auto-detects and activates the plan
- Use `/plan:save` to write it to disk

### Plan Lifecycle

```
Create Plan → Activate → Execute Steps → Track Progress → Complete
```

**1. Create**
- In Plan mode: Ask the LLM to create a plan
- Plan is auto-detected and stored
- Optionally save with `/plan:save`

**2. Activate**
- Plan becomes "active" for this session and is cleared when a new session starts, keeping your slate fresh
- Footer shows progress: `📋 [3/7] ━━━━━░░░ 43% — "Current step"`
- Use `/todos` to view full plan

**3. Execute**
- Switch to Build mode with `/plan`
- Agent receives plan in system prompt
- Work through steps in order

**4. Track**
- Agent marks steps complete with `[DONE:n]` tags
- Flash notification shows completion
- Footer updates in real-time
- State saves to `.agents/.plan-state.json`

**5. Complete**
- All steps marked done
- Footer shows 100%
- Plan state clears automatically on next session start
- Saved markdown files (via `/plan:save`) persist on disk

### Example Workflow

```bash
# 1. Create a plan in Plan mode
User: Create a plan for refactoring the API layer

# LLM responds with:
Plan:
1. Audit current API structure
2. Identify common patterns
3. Design abstraction layer
...

# System auto-detects:
→ Plan activated with 7 steps
→ 📋 [0/7] ░░░░░░░░ 0% — "Audit current API structure"

# 2. Save plan to disk (optional)
User: /plan:save
→ Plan saved to .agents/plan-20260311-143000.md

# 3. View plan details
User: /todos
User: Let's start with step 1

Agent: I'll audit the API structure... [DONE:1]
→ ✅ Step 1 complete — "Audit current API structure" [1/7]
→ 📋 [1/7] ━░░░░░░░ 14% — "Identify common patterns"

# 4. Continue through steps
Agent: Now identifying patterns... [DONE:2]
...

# 5. Session resume (later)
User: pi --resume
→ Plan restored from .agents/.plan-state.json
→ 📋 [3/7] ━━━━━░░░ 43% — "Design abstraction layer"
```

### Plan State Persistence

Plan state is saved continuously but reset on every session start so you always begin with a clean todo board.
- **Location:** `.agents/.plan-state.json`
- **Auto-saved:** After every step completion
- **Cleared:** Automatically on session start (file deleted)

### Conversation Plan Detection

When in Plan mode, the system auto-detects plans in agent responses:

**Detected formats:**
```
Plan:
1. First step
2. Second step
3. Third step
```

**Requirements:**
- Must have "Plan:" header (case-insensitive)
- Minimum 2 numbered steps
- Only when no existing plan (prevents false positives)

### `[DONE:n]` Markers

In Build mode with an active plan, the agent marks completed steps:

```
Agent: I've implemented the auth service... [DONE:4]
```

**Features:**
- Automatic detection on every turn
- Updates plan state immediately
- Shows flash notification
- Updates footer status
- Persists to disk

### Plan Progress Widget

**3-State Display System:**

1. **Compact Footer (Always Visible)**
   ```
   📋 [3/7] ━━━━━░░░ 43% — "Implement auth service"
   ```
   - Zero screen space
   - Real-time updates
   - Shows current step

2. **Expanded View (On-Demand)**
   ```
   ─────────────────────────────────────
    📋 Plan Progress [3/7]
   ─────────────────────────────────────
    ✅ 1. Analyze auth module
    ✅ 2. Identify dependencies
    ✅ 3. Create interface definitions
    ⬜ 4. Implement auth service        ← current
    ⬜ 5. Add tests
    ⬜ 6. Update routes
    ⬜ 7. Documentation
   ─────────────────────────────────────
   ```
   - Triggered by `/todos`
   - Auto-dismisses after 5 seconds
   - Full step details

3. **Step Completion Flash**
   ```
   ✅ Step 4 complete — "Implement auth service" [4/7]
   ```
   - 2-second notification
   - Immediate feedback
   - Then back to footer

---

## Tools

### find_files

Locate files in the codebase matching a query. Spawns a read-only DATAWEAVER sub-agent that searches, reads, and returns a curated summary of relevant files.

**Parameters:**
- `query` (required) — describe the files, patterns, or code you're looking for
- `scope` (optional) — directory scope to narrow the search (e.g., `src/auth`)

**Use this instead of manually reading directories.**

---

Current date: 2026-05-08
Current working directory: /Users/mpetrovic/Dev/devoops/github/cmd.exe
## Operating Mode: BUILD

You are in **Build mode**. You have full access to implementation tools.

### Available tools
- read
- write
- edit
- bash
- find_files
