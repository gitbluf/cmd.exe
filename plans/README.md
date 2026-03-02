# Dispath Neurogrid Upgrade - Master Plan

**Status:** Planning Phase Complete  
**Start Date:** 2025-02-27  
**Last Updated:** 2025-02-27  

---

## 📋 Overview

Transform dispath from a generic multi-agent launcher into a **plan-first, orchestration-focused agent system** modeled on Neurogrid's sophisticated architecture.

### Current State (Before)
- Generic agent templates (analyst, executor, researcher, auditor, architect)
- Simple agent spawning
- Sandbox infrastructure in place
- No workflow structure

### Target State (After)
- 6 specialized agents (cortex, blueprint, blackice, dataweaver, ghost, hardline)
- Plan-first workflow (plan → review → execute)
- Swarm orchestration for concurrent execution
- Structured recording and history
- Full command suite with `:` syntax

---

## 🚀 Four-Phase Execution Plan

### **Phase 1: Agent Specialization**
**Goal:** Replace generic templates with 6 specialized Neurogrid-style agents

| Agent | Role | Tools | Writes? | Shell? |
|-------|------|-------|---------|--------|
| **cortex** | Orchestrator | platform tools | ❌ | ❌ |
| **blueprint** | Planner | file_read, web_search | ✅ (plans) | ❌ |
| **blackice** | Reviewer | file_read | ❌ | ❌ |
| **dataweaver** | Reconnaissance | file_read, shell (limited) | ❌ | 🔒 |
| **ghost** | Implementation | file_*, shell_exec | ✅ | ✅ |
| **hardline** | System Ops | shell_exec, file_read | ❌ | ✅ |

**Deliverable:** 6 agent definitions with specialized prompts, tool access, and configuration overrides

**Files:** 
- Create: `src/agents/definitions/` (7 files)
- Update: `src/templates/`, `src/agents/executor.ts`, `src/utils/config.ts`

**Effort:** ~2 hours

---

### **Phase 2: Plan-First Workflow**
**Goal:** Implement `/dispath:plan`, `/dispath:synth`, `/dispath:apply` commands

**Workflow:**
```
/dispath:plan <request>  → Generate plan via @blueprint
                           Write to .ai/plan-*.md
                           
[User reviews plan]

/dispath:synth <plan-id> → Execute plan via @ghost
                           Implement all steps
                           
/dispath:apply <change>  → Quick edit (no plan needed)
```

**Commands:**
- `/dispath:plan <request>` - Generate plan
- `/dispath:synth <plan-id>` - Execute plan
- `/dispath:apply <instruction>` - Quick edit
- `/dispath:plans` - List all plans
- `/dispath:clean` - Remove all plans

**Deliverable:** Full plan-first workflow with registry and lifecycle tracking

**Files:**
- Create: `src/plans/`, `src/commands/` (plan.ts, synth.ts, apply.ts, plans.ts, clean.ts)
- Update: `src/index.ts`

**Effort:** ~3 hours

---

### **Phase 3: Swarm Orchestration**
**Goal:** Implement `/dispath:dispatch` for concurrent multi-agent execution

**Command Format:**
```bash
/dispath:dispatch \
  --concurrency 5 \
  --timeout 300000 \
  --worktrees false \
  task-1 dataweaver "Find API endpoints" | \
  task-2 blackice "Review security" | \
  task-3 ghost "Implement changes"
```

**Features:**
- Configurable concurrency (1-20, default 5)
- Per-task timeout (default 5 min)
- Optional git worktree isolation
- Auto-recorded swarm history
- Concurrent task isolation

**Commands:**
- `/dispath:dispatch [options] <tasks>` - Dispatch swarm
- `/dispath:swarm-status <id>` - Get swarm status
- `/dispath:swarm-history` - List recent swarms
- `/dispath:swarm-abort <id>` - Cancel swarm

**Deliverable:** Full swarm orchestration with registry, concurrency control, and worktree isolation

**Files:**
- Create: `src/swarms/`, `src/commands/dispatch.ts`, etc.
- Update: `src/utils/git.ts`, `src/index.ts`

**Effort:** ~4 hours

---

### **Phase 4: Structured Recording**
**Goal:** Auto-record all agent sessions, plans, and swarms with metadata

**Registries:**
- `.ai/.dispath-sessions.json` - Individual agent sessions
- `.ai/.dispath-plans.json` - Plan lifecycle (from Phase 2)
- `.ai/.dispath-swarms.json` - Swarm records (from Phase 3)

**Recorded Data:**
- Session ID, agent, request, status
- Output (first 1000 chars), full output path
- Duration, tokens used, timestamp
- Links to plans/swarms

**Commands:**
- `/dispath:history` - Show recent activity and stats

**Features:**
- Auto-record every agent invocation
- Link sessions to plans and swarms
- Calculate aggregate stats
- Prune registries (keep latest 100)
- Query history across all registries

**Deliverable:** Comprehensive recording infrastructure with linked data model

**Files:**
- Create: `src/sessions/`, `src/recording/`, `src/commands/history.ts`
- Update: `src/agents/executor.ts`, Phase 2 & 3 command handlers

**Effort:** ~2 hours

---

## 📊 Overall Architecture

### Command Structure

```
/dispath:plan <request>              Phase 2
/dispath:synth <plan-id>             Phase 2
/dispath:apply <instruction>         Phase 2
/dispath:plans                        Phase 2
/dispath:clean                        Phase 2

/dispath:dispatch [opts] <tasks>     Phase 3
/dispath:swarm-status <id>           Phase 3
/dispath:swarm-history               Phase 3
/dispath:swarm-abort <id>            Phase 3

/dispath:history                      Phase 4
/dispath:list                         Phase 1 (updated)
```

### Directory Structure (After All Phases)

```
src/
├── index.ts                    (Main handler - updated)
├── agents/
│   ├── definitions/            [NEW - Phase 1]
│   │   ├── types.ts
│   │   ├── cortex.ts
│   │   ├── blueprint.ts
│   │   ├── blackice.ts
│   │   ├── dataweaver.ts
│   │   ├── ghost.ts
│   │   ├── hardline.ts
│   │   └── index.ts
│   ├── types.ts                [Updated - Phase 1]
│   ├── executor.ts             [Updated - all phases]
│   └── index.ts
├── plans/                       [NEW - Phase 2]
│   ├── types.ts
│   ├── registry.ts
│   ├── generator.ts
│   └── index.ts
├── swarms/                      [NEW - Phase 3]
│   ├── types.ts
│   ├── registry.ts
│   ├── executor.ts
│   ├── parser.ts
│   ├── formatter.ts
│   └── index.ts
├── sessions/                    [NEW - Phase 4]
│   ├── types.ts
│   └── registry.ts
├── recording/                   [NEW - Phase 4]
│   ├── recorder.ts
│   └── index.ts
├── commands/                    [NEW - Phases 2, 3, 4]
│   ├── plan.ts
│   ├── synth.ts
│   ├── apply.ts
│   ├── plans.ts
│   ├── clean.ts
│   ├── dispatch.ts
│   ├── swarm-status.ts
│   ├── swarm-history.ts
│   ├── swarm-abort.ts
│   ├── history.ts
│   └── index.ts
├── templates/
│   ├── types.ts                [Updated - Phase 1]
│   ├── defaults.ts             [Updated - Phase 1]
│   ├── utils.ts                [Updated - Phase 1]
│   └── index.ts
├── ui/
│   ├── components.ts           [Updated - all phases]
│   ├── widget.ts
│   └── index.ts
├── sandbox/
│   ├── adapters.ts
│   ├── tools.ts
│   └── index.ts
└── utils/
    ├── config.ts               [Updated - Phase 1]
    ├── git.ts                  [Updated - Phase 3]
    └── index.ts

.ai/                            [Phase 2, 3, 4]
├── plan-*.md                   Phase 2 (plans)
├── .dispath-plans.json         Phase 2 (registry)
├── .dispath-sessions.json      Phase 4 (registry)
├── .dispath-swarms.json        Phase 3 (registry)
└── .worktrees/                 Phase 3 (git worktrees)
    └── swarm-<id>/
        └── task-<id>/
```

### Data Flow

```
User Input
  ↓
/dispath:plan <request>
  ├─ SessionRecorder.startSession()
  ├─ Load @blueprint agent
  ├─ Generate plan content
  ├─ Write to .ai/plan-*.md
  ├─ Create PlanMetadata
  ├─ Update .ai/.dispath-plans.json
  ├─ SessionRecorder.completeSession()
  ├─ Update .ai/.dispath-sessions.json
  └─ Show result

---

/dispath:synth <plan-id>
  ├─ Load plan from .ai/plan-*.md
  ├─ SessionRecorder.startSession() [type: synth, planId: xxx]
  ├─ Load @ghost agent
  ├─ Execute plan
  ├─ Stream output
  ├─ SessionRecorder.completeSession()
  ├─ Update .ai/.dispath-sessions.json
  ├─ Update .ai/.dispath-plans.json (add execution)
  └─ Show result

---

/dispath:dispatch ... | ... | ...
  ├─ Parse tasks and options
  ├─ Create SwarmRecord
  ├─ For each task up to concurrency:
  │  ├─ Create git worktree (if enabled)
  │  ├─ SessionRecorder.startSession() [swarmId, taskId]
  │  ├─ Load agent
  │  ├─ Execute with timeout
  │  ├─ SessionRecorder.completeSession()
  │  ├─ Remove worktree
  │  └─ Next task
  ├─ Calculate stats
  ├─ Update .ai/.dispath-swarms.json
  ├─ Update .ai/.dispath-sessions.json (one per task)
  └─ Show summary

---

/dispath:history
  ├─ Load .ai/.dispath-sessions.json
  ├─ Load .ai/.dispath-plans.json
  ├─ Load .ai/.dispath-swarms.json
  ├─ Aggregate recent activity
  ├─ Calculate overall stats
  └─ Display summary
```

---

## 🎯 Rollout Strategy

### Week 1: Phase 1
- Implement agent definitions
- Test agent loading and specialization
- Update configuration system
- Deploy Phase 1

### Week 2: Phase 2
- Implement plan-first workflow
- Build plan registry and lifecycle
- Test plan generation and execution
- Deploy Phase 2

### Week 3: Phase 3
- Implement swarm orchestration
- Build concurrency and timeout handling
- Test git worktree isolation
- Deploy Phase 3

### Week 4: Phase 4
- Implement structured recording
- Build unified query system
- Test history and stats
- Deploy Phase 4

---

## ✅ Completion Criteria

### Phase 1 ✅
- [ ] 6 agents defined with specialized prompts
- [ ] Agent overrides supported (model, temperature, disable)
- [ ] `/dispath:list` shows all agents
- [ ] Build passes, zero warnings
- [ ] All tests pass

### Phase 2 ✅
- [ ] `/dispath:plan` generates plans
- [ ] `/dispath:synth` executes plans
- [ ] `/dispath:apply` works for quick edits
- [ ] `/dispath:plans` lists all plans
- [ ] `/dispath:clean` removes plans
- [ ] Plan registry persists and loads
- [ ] Build passes, zero warnings
- [ ] All tests pass

### Phase 3 ✅
- [ ] `/dispath:dispatch` parses and executes swarms
- [ ] Concurrency control working (1-20 tasks)
- [ ] Per-task timeout enforced
- [ ] Git worktree isolation working (if enabled)
- [ ] `/dispath:swarm-status` queries results
- [ ] `/dispath:swarm-history` shows recent swarms
- [ ] Swarm registry persists and loads
- [ ] Build passes, zero warnings
- [ ] All tests pass

### Phase 4 ✅
- [ ] All sessions auto-recorded with metadata
- [ ] Sessions linked to plans/swarms
- [ ] Registry pruning works (keep latest 100)
- [ ] `/dispath:history` aggregates all data
- [ ] Stats calculated correctly
- [ ] Build passes, zero warnings
- [ ] All tests pass

---

## 📚 Documentation

### Phase 1
- `AGENTS_REFERENCE.md` - Agent roles and capabilities
- `CONFIGURATION_AGENTS.md` - Agent override configuration

### Phase 2
- `WORKFLOW_PLAN_FIRST.md` - Plan-first workflow guide
- `PLAN_FORMAT.md` - Plan file specification

### Phase 3
- `SWARM_USAGE.md` - Swarm dispatch usage
- `SWARM_ARCHITECTURE.md` - Technical architecture

### Phase 4
- `RECORDING_GUIDE.md` - What gets recorded
- `REGISTRY_FORMAT.md` - Registry file formats

### Cross-Phase
- `COMMANDS_REFERENCE.md` - All commands (complete)
- `QUICKSTART.md` - Updated quick start
- `ARCHITECTURE.md` - Updated overall architecture

---

## 🔧 Implementation Tips

### Build & Test
```bash
# After each phase
npm run build           # Compile TypeScript
npm run test           # Run tests (if applicable)

# Manual testing
/dispath:list          # Should work at all phases
/dispath:plan "test"   # Works from Phase 2
/dispath:dispatch ...  # Works from Phase 3
/dispath:history       # Works from Phase 4
```

### Common Patterns

**Agent Invocation:**
```typescript
const agent = await loadAgent("cortex");
const result = await agent.execute(prompt);
```

**Registry Loading:**
```typescript
const registry = loadPlanRegistry(workspaceRoot);
// ... modify registry
savePlanRegistry(workspaceRoot, registry);
```

**Concurrency:**
```typescript
const queue = tasks.slice();
const running = new Map();

while (queue.length || running.size) {
  while (queue.length && running.size < concurrency) {
    const task = queue.shift();
    running.set(task.id, executeTask(task));
  }
  if (running.size) await Promise.race(running.values());
}
```

---

## 🚨 Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking changes to agent API | Maintain backward compatibility with old template format |
| Performance impact of swarms | Configurable concurrency, per-task timeouts |
| Registry file size growth | Automatic pruning (keep latest 100) |
| Git worktree conflicts | Use unique branch naming, aggressive cleanup |
| Token usage explosion | Token tracking per session, cost warnings |

---

## 📈 Success Metrics

- All 4 phases completed in ~2 weeks
- Build passes with zero warnings throughout
- No breaking changes to existing dispath usage
- All tests pass for each phase
- Documentation complete and clear
- Performance degradation < 10% per phase
- User adoption smooth (existing features still work)

---

## 🎉 Vision

After all 4 phases, dispath will be a **production-grade agent orchestration system** with:

✅ 6 specialized agents (Neurogrid-style)  
✅ Plan-first workflow (structured problem-solving)  
✅ Swarm orchestration (concurrent execution)  
✅ Structured recording (auditability)  
✅ Full command suite (` /dispath:*`)  
✅ Comprehensive documentation  
✅ Zero warnings, full type coverage  
✅ Ready for enterprise use  

---

**Next Step:** Begin Phase 1 implementation
