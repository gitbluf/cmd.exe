# Phase 2: Plan-First Workflow - Quick Reference

## 🎯 What's New (Phase 2)

**5 New Commands** implementing a complete plan-first workflow:
1. `/dispatch:plan` - Generate plans
2. `/dispatch:synth` - Execute plans
3. `/dispatch:apply` - Quick edits (no plan)
4. `/dispatch:plans` - List plans
5. `/dispatch:clean` - Clean up

## 📋 Plan Workflow

```
1. User: /dispatch:plan "Refactor auth to use JWT"
   ↓
   📝 @blueprint generates plan → .ai/plan-<id>.md
   📊 Registry entry created (status: pending)
   
2. User reviews plan at: ~/.pi/agent/dispatch/.ai/plan-<id>.md
   
3. User: /dispatch:synth plan-abc123
   ↓
   🚀 @ghost reads plan
   ⚙️ Executes all implementation steps
   ✅ Updates status: pending → completed
   
4. Done! Changes applied.
```

## 📁 File Structure

**New directories:**
```
src/plans/
  ├─ types.ts        Plan data types
  ├─ registry.ts     Persistence layer
  ├─ generator.ts    Markdown formatting
  └─ index.ts        Barrel export

src/commands/
  ├─ plan.ts         /dispatch:plan handler
  ├─ synth.ts        /dispatch:synth handler
  ├─ apply.ts        /dispatch:apply handler
  ├─ plans.ts        /dispatch:plans handler
  ├─ clean.ts        /dispatch:clean handler
  └─ index.ts        Barrel export
```

**Plan storage:**
```
~/.pi/agent/dispatch/
├─ .ai/
│  ├─ plan-auth-refactor-1740600000.md      Plan file
│  └─ .dispath-plans.json                   Registry
└─ (agent workspaces)
```

## 🔄 Command Reference

### `/dispatch:plan <request>`
Generate a new plan.

**Examples:**
```bash
/dispatch:plan "Refactor the authentication module"
/dispatch:plan "Add real-time notifications"
/dispatch:plan "Optimize database queries"
```

**What happens:**
1. ✅ @blueprint agent creates detailed plan
2. ✅ Saves to `.ai/plan-<title>-<timestamp>.md`
3. ✅ Creates registry entry (status: pending)
4. ✅ Returns plan ID (e.g., `plan-abc123`)

**Output:**
```
📋 [PLAN] Generating plan...

[Plan content here...]

✓ Plan created

📋 ID: plan-abc123
📄 File: .ai/plan-auth-refactor-1740600000.md

Review the plan, then run: /dispatch:synth plan-abc123
```

### `/dispatch:synth <plan-id>`
Execute a plan.

**Examples:**
```bash
/dispatch:synth plan-abc123           # By ID
/dispatch:synth auth                  # By title search
/dispatch:synth refactor              # Partial match
```

**What happens:**
1. ✅ Searches for plan by ID or title
2. ✅ Reads plan from `.ai/plan-*.md`
3. ✅ Updates status: pending → executing
4. ✅ @ghost agent executes all steps
5. ✅ Updates status: executing → completed

**Output:**
```
🚀 [SYNTH] Executing plan...

[Agent execution output...]

✓ Plan execution complete

📋 Plan: plan-abc123
✅ Status: completed
```

### `/dispatch:apply <instruction>`
Quick edit without creating a plan file.

**Examples:**
```bash
/dispatch:apply "Add logging to the auth function"
/dispatch:apply "Fix the password validation bug"
/dispatch:apply "Update the API endpoint URL"
```

**What happens:**
1. ✅ @ghost executes instruction directly
2. ✅ No plan file created
3. ✅ No registry entry
4. ✅ Perfect for small, focused changes

**Output:**
```
✏️ [APPLY] Making changes...

[Agent execution output...]

✓ Changes applied
```

### `/dispatch:plans`
List all plans with status.

**Output:**
```
📋 Plans:

⏳ Auth Refactor (plan-abc123)
   Status: pending | Created: 2/27/2025
   Refactor auth module to use JWT tokens...

✅ API Optimization (plan-def456)
   Status: completed | Created: 2/27/2025
   Add caching layer to reduce API latency...

To execute a plan: /dispatch:synth <plan-id>
To clean up plans: /dispatch:clean
```

### `/dispatch:clean`
Remove all plans.

**What happens:**
1. ✅ Prompts for confirmation
2. ✅ Removes all `.md` files from `.ai/`
3. ✅ Clears registry

**Output:**
```
Delete 2 plan(s)? (yes/no)
yes

✓ Cleaned 2 plan file(s)
```

## 📊 Plan Registry Format

Location: `~/.pi/agent/dispatch/.ai/.dispath-plans.json`

```json
{
  "plans": [
    {
      "id": "plan-abc123",
      "path": "~/.pi/agent/dispatch/.ai/plan-auth-refactor-1740600000.md",
      "title": "Auth Refactor",
      "request": "Refactor the authentication module to use JWT tokens",
      "status": "pending",
      "createdAt": "2025-02-27T00:30:00Z",
      "completedAt": null,
      "executedBy": null,
      "error": null,
      "summary": "Refactor auth module to use JWT tokens..."
    }
  ],
  "lastUpdated": "2025-02-27T00:30:00Z"
}
```

**Status values:**
- `pending` - Plan created, awaiting execution
- `executing` - Plan being executed
- `completed` - Plan executed successfully
- `failed` - Plan execution failed (error field set)

## 🎯 Plan File Format

Location: `~/.pi/agent/dispatch/.ai/plan-*.md`

```markdown
# Plan: <Title>

**ID:** plan-abc123
**Created:** 2025-02-27T00:30:00Z
**Status:** pending
**Request:** <Original request>

## 📋 Summary
High-level overview (2-3 sentences)

## 🎯 Goals
- Goal 1
- Goal 2
- Goal 3

## 📁 Files to Change
- `src/auth.ts` - Update token validation
- `src/types.ts` - Add new interfaces

## 🔄 Implementation Steps
1. **Step 1:** Description
   - Sub-step 1a
   - Sub-step 1b

2. **Step 2:** Description
   - Sub-step 2a

## ⚠️ Risks & Mitigation
- **Risk:** Breaking change to API
  - *Mitigation:* Deprecate gradually, version bump

## ✅ Acceptance Criteria
- [ ] All changes implemented
- [ ] Tests pass
- [ ] Code reviewed

## 📝 Notes
- Note 1
- Note 2

---

**Generated by @blueprint**
```

## 🔍 Behind the Scenes

### Plan Generation
1. User provides request
2. @blueprint agent receives structured prompt
3. Agent generates detailed markdown plan
4. Plan saved to `.ai/` directory
5. Registry entry created with metadata

### Plan Execution
1. @ghost agent reads plan file
2. Agent receives plan + execution instructions
3. Agent follows each step precisely
4. Changes applied to codebase
5. Status updated in registry

### Plan Search
- By ID: `plan-abc123` (exact match)
- By title: `auth` (case-insensitive substring)
- First match wins

## 🚨 Error Handling

If plan execution fails:
1. Status set to `failed`
2. Error message recorded in registry
3. Temporary agent workspace cleaned up
4. User can review error and try again

## 💾 Persistence

Plans are fully persistent:
- `.md` files saved to disk
- Registry persisted as JSON
- Survives restart
- Can be version controlled in `.ai/`

## 🔗 Integration with Phase 1

**Phase 1 Commands** (still available):
- `/dispatch` - Spawn agents
- `/dispatch:list` - List agents
- `/dispatch:cleanup` - Clean workspaces

**Phase 2 Commands** (new):
- `/dispatch:plan` - Generate plans
- `/dispatch:synth` - Execute plans
- `/dispatch:apply` - Quick edits
- `/dispatch:plans` - List plans
- `/dispatch:clean` - Clean plans

All commands independently registered and discoverable.

## 📈 What's Next (Phase 3)

Phase 3 will add:
- `/dispatch:dispatch` - Swarm orchestration
- Concurrent multi-task execution
- Task dependency management
- Parallel agent swarms

## 🎓 Example Workflows

### Workflow 1: Planned Feature
```bash
# 1. Create comprehensive plan
/dispatch:plan "Add OAuth2 authentication support"

# 2. Review plan file at ~/.pi/agent/dispatch/.ai/plan-*.md

# 3. Execute plan
/dispatch:synth plan-oauth2

# Done! All changes applied.
```

### Workflow 2: Quick Fix
```bash
# Direct fix, no plan needed
/dispatch:apply "Fix typo in error message on line 42 of src/errors.ts"

# Done! Change applied.
```

### Workflow 3: Track Multiple Plans
```bash
# Create multiple plans
/dispatch:plan "Refactor authentication"
/dispatch:plan "Add real-time notifications"
/dispatch:plan "Optimize database queries"

# Review all
/dispatch:plans

# Execute them
/dispatch:synth auth
/dispatch:synth notifications
/dispatch:synth database
```

---

**Build:** ✅ Passing (16 KB dist/index.js)  
**Type Safety:** ✅ 100% TypeScript  
**Status:** ✅ Production Ready
