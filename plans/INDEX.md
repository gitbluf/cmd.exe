# Dispath Neurogrid Upgrade - Planning Index

All planning documents for the transformation from generic multi-agent launcher to Neurogrid-style orchestration system.

---

## 📚 Document Map

### Master Planning Documents

| Document | Size | Purpose |
|----------|------|---------|
| **[README.md](README.md)** | 14 KB | **START HERE** - Master plan overview, 4-phase transformation, timeline, architecture |
| **[plan-phase-1.md](plan-phase-1.md)** | 11 KB | Agent Specialization - 6 Neurogrid agents (cortex, blueprint, blackice, dataweaver, ghost, hardline) |
| **[plan-phase-2.md](plan-phase-2.md)** | 12 KB | Plan-First Workflow - `/dispath:plan`, `/dispath:synth`, `/dispath:apply` commands |
| **[plan-phase-3.md](plan-phase-3.md)** | 17 KB | Swarm Orchestration - `/dispath:dispatch` with concurrency, timeout, worktree isolation |
| **[plan-phase-4.md](plan-phase-4.md)** | 15 KB | Structured Recording - Auto-record sessions, plans, swarms with linked data model |

**Total Planning Documentation:** 69 KB across 5 files

---

## 🎯 Quick Navigation

### By Use Case

**I want to understand the overall plan:**
→ Read [README.md](README.md)

**I want to see Phase 1 details (Agent Specialization):**
→ Read [plan-phase-1.md](plan-phase-1.md)

**I want to see Phase 2 details (Plan-First Workflow):**
→ Read [plan-phase-2.md](plan-phase-2.md)

**I want to see Phase 3 details (Swarm Orchestration):**
→ Read [plan-phase-3.md](plan-phase-3.md)

**I want to see Phase 4 details (Structured Recording):**
→ Read [plan-phase-4.md](plan-phase-4.md)

**I want implementation checklists:**
→ See "Completion Criteria" sections in each phase file
→ See "✅ Testing Checklist" at end of each phase

**I want to understand the data model:**
→ See "📐 Technical Specification" in each phase file
→ See "🔄 Detailed Implementation Steps" for implementation order

### By Timeline

**Week 1 (Phase 1):**
→ [plan-phase-1.md](plan-phase-1.md) - Agent Specialization

**Week 2 (Phase 2):**
→ [plan-phase-2.md](plan-phase-2.md) - Plan-First Workflow

**Week 3 (Phase 3):**
→ [plan-phase-3.md](plan-phase-3.md) - Swarm Orchestration

**Week 4 (Phase 4):**
→ [plan-phase-4.md](plan-phase-4.md) - Structured Recording

---

## 📋 Overview: What Gets Built

### Phase 1: 6 Specialized Agents
- **CORTEX** - Primary orchestrator (routes requests)
- **BLUEPRINT** - Planner (generates `.ai/plan-*.md` files)
- **BLACKICE** - Code reviewer (security & quality)
- **DATAWEAVER** - Codebase analyst (finds files, patterns)
- **GHOST** - Implementation (writes code, executes plans)
- **HARDLINE** - System operator (shell commands)

**Files Created:** 8 (src/agents/definitions/)  
**Files Updated:** 4 (templates, executor, config, main)

### Phase 2: Plan-First Workflow
- `/dispath:plan <request>` → Generate plan
- `/dispath:synth <plan-id>` → Execute plan
- `/dispath:apply <instruction>` → Quick edit
- `/dispath:plans` → List plans
- `/dispath:clean` → Remove plans

**New Registries:** `.ai/.dispath-plans.json`  
**Files Created:** 9 (src/plans/ + src/commands/)  
**Files Updated:** 2 (index.ts, executor.ts)

### Phase 3: Swarm Orchestration
- `/dispath:dispatch [options] task-1 agent "req" | task-2 agent "req"` → Parallel execution
- `/dispath:swarm-status <id>` → Query results
- `/dispath:swarm-history` → List swarms
- `/dispath:swarm-abort <id>` → Cancel swarm

**Features:** Configurable concurrency, per-task timeout, git worktree isolation  
**New Registries:** `.ai/.dispath-swarms.json`  
**Files Created:** 10 (src/swarms/ + src/commands/)  
**Files Updated:** 2 (git.ts, index.ts)

### Phase 4: Structured Recording
- `/dispath:history` → Show activity & stats
- Auto-record all sessions with metadata
- Link sessions to plans & swarms
- Aggregate statistics

**New Registries:** `.ai/.dispath-sessions.json`  
**Registry Updates:** .dispath-plans.json, .dispath-swarms.json  
**Files Created:** 4 (src/sessions/ + src/recording/ + command)  
**Files Updated:** 2 (executor.ts, command handlers)

---

## 🔍 Document Structure

Each phase document follows this structure:

1. **Overview** - What we're building and why
2. **Success Criteria** - What "done" looks like
3. **Technical Specification** - Data types, APIs, file formats
4. **Detailed Implementation Steps** - Step-by-step walkthrough
5. **Files to Create/Update** - Complete file listing
6. **Testing Checklist** - Validation points
7. **Documentation** - Docs to create after phase

---

## 📊 Key Statistics

| Metric | Value |
|--------|-------|
| **Total Phases** | 4 |
| **Estimated Effort** | ~11 hours |
| **Timeline** | ~2 weeks |
| **New Agent Types** | 6 |
| **New Commands** | 11 |
| **New Registries** | 3 |
| **Total Files to Create** | ~32 |
| **Total Files to Update** | ~10 |
| **Planning Documentation** | 69 KB |

---

## ✨ Expected Result

After all 4 phases:

```
dispath (before)          →    dispath (after)
─────────────────              ───────────────
Generic agents                 6 specialized agents
/dispath 3                     /dispath:cortex "route"
No workflow                    Plan-first workflow
Sequential execution           Concurrent swarms
No history                     Complete recording
```

---

## 🚀 Getting Started

### Step 1: Understand the Plan
1. Read [README.md](README.md) for overview
2. Review [plan-phase-1.md](plan-phase-1.md)

### Step 2: Begin Phase 1
1. Create `src/agents/definitions/` directory
2. Implement 6 agent definition files
3. Update templates and executor
4. Build and test

### Step 3: Iterate Through Phases
1. After Phase 1 passes, move to Phase 2
2. After Phase 2 passes, move to Phase 3
3. After Phase 3 passes, move to Phase 4

### Step 4: Validate & Deploy
1. Run full test suite
2. Build with zero warnings
3. Deploy to production

---

## 📝 Notes

- All plans use OpenSpec format (detailed, implementable specifications)
- Each phase builds on previous phases
- No breaking changes to existing API
- Backward compatible with Phase 0 (current state)
- Full TypeScript with strict mode
- Zero warnings requirement

---

## 💡 Implementation Tips

### Use Case: I'm starting Phase 1
1. Open [plan-phase-1.md](plan-phase-1.md)
2. Go to "🔄 Detailed Implementation Steps"
3. Follow the 6 numbered steps
4. Reference "📦 Files to Create" for file structure
5. Check "✅ Testing Checklist" when done

### Use Case: I'm debugging Phase 2
1. Open [plan-phase-2.md](plan-phase-2.md)
2. Look at "📐 Technical Specification"
3. Check data type definitions
4. Review "🔄 Detailed Implementation Steps" for context
5. Reference "✅ Testing Checklist" to find the issue

### Use Case: I need to understand dependencies
1. Look at "Depends On:" line at top of each phase
2. All phases depend on prior phases
3. Phase structure: 1 → 2 → 3 → 4
4. No skipping phases

---

## 📂 File Locations

All planning documents located in: `.pi/extensions/dispath/plans/`

Relative to project root:
```
.pi/extensions/dispath/plans/
├── README.md              (This is the master plan)
├── plan-phase-1.md        (Start with agent definitions)
├── plan-phase-2.md        (Then plan-first workflow)
├── plan-phase-3.md        (Then swarm orchestration)
├── plan-phase-4.md        (Finally recording)
└── INDEX.md               (This navigation guide)
```

---

## 🎯 Success Definition

**Phase 1 Complete:** 6 agents defined, configurable, zero warnings  
**Phase 2 Complete:** Plan-first workflow working, `/dispath:plan` + `/dispath:synth` functional  
**Phase 3 Complete:** Swarm dispatch working, concurrent execution verified  
**Phase 4 Complete:** Recording infrastructure working, `/dispath:history` shows all data  

**All Phases Complete:** Production-ready Neurogrid-style agent orchestration system

---

## 📞 Questions?

Refer to the specific phase document for your question:

- **"What agents will exist?"** → [plan-phase-1.md](plan-phase-1.md)
- **"How does planning work?"** → [plan-phase-2.md](plan-phase-2.md)
- **"How does swarm dispatch work?"** → [plan-phase-3.md](plan-phase-3.md)
- **"What gets recorded?"** → [plan-phase-4.md](plan-phase-4.md)
- **"What's the overall timeline?"** → [README.md](README.md)

Each document contains detailed specifications, examples, and implementation guidance.

---

**Status:** ✅ Planning Phase Complete  
**Last Updated:** 2025-02-27  
**Ready to Begin:** Phase 1 (Agent Specialization)
