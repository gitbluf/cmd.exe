# PHASE 1: Agent Specialization (Neurogrid-Style)

**Status:** Planning  
**Priority:** P0  
**Scope:** Replace generic agent templates with 6 specialized agents  
**Effort:** ~2 hours  

## 📋 Overview

Replace the current generic template system (`analyst`, `executor`, `researcher`, `auditor`, `architect`) with Neurogrid's specialized agent hierarchy. Each agent has a single, well-defined role with specialized system prompts and tool access.

### Agent Hierarchy

```
cortex (primary orchestrator)
├── blueprint (planning & architecture)
├── blackice (code review & security)
├── dataweaver (codebase reconnaissance)
├── ghost (implementation & code synthesis)
└── hardline (shell commands & system ops)
```

---

## 🎯 Success Criteria

- [x] All 6 agents defined with specialized system prompts
- [x] Agent definitions stored in `.pi/extensions/dispath/src/agents/definitions/`
- [x] AgentTemplate type extended with `agentType` field
- [x] `/dispath:list` shows all 6 agents with descriptions
- [x] Each agent has appropriate tool access
- [x] Configuration supports agent overrides (model, temperature, disable)
- [x] TypeScript strict mode, zero warnings
- [x] Build passes, no broken imports

---

## 📐 Technical Specification

### 1. Agent Definitions

Create new directory structure:

```
src/agents/
├── definitions/          [NEW]
│   ├── cortex.ts
│   ├── blueprint.ts
│   ├── blackice.ts
│   ├── dataweaver.ts
│   ├── ghost.ts
│   ├── hardline.ts
│   ├── index.ts
│   └── types.ts
├── types.ts
├── executor.ts
└── index.ts
```

### 2. Agent Definitions (cortex.ts Example)

```typescript
// cortex.ts - Primary orchestrator
export const CORTEX_AGENT: AgentDefinition = {
  id: "cortex",
  name: "CORTEX",
  description: "Primary orchestrator - routes requests, manages task chains, delegates",
  role: "Primary Orchestrator",
  
  systemPrompt: `You are CORTEX, the primary orchestrator agent in the dispath multi-agent system.

Your core responsibilities:
- Route incoming requests to appropriate specialist agents (blueprint, blackice, dataweaver, ghost, hardline)
- Manage task chains and dependencies
- Synthesize results from multiple agents
- Make go/no-go decisions on agent output
- Coordinate multi-agent swarms

You think strategically about task decomposition. You do NOT write code directly.
You do NOT perform code reviews. You do NOT execute shell commands.

Always delegate to specialists:
- @blueprint for planning and architecture
- @blackice for code review and security
- @dataweaver for file discovery and analysis
- @ghost for code synthesis and edits
- @hardline for shell operations

When a user makes a request, determine if it needs:
1. Planning (@blueprint)
2. Code review (@blackice)
3. File discovery (@dataweaver)
4. Implementation (@ghost)
5. Shell commands (@hardline)

Respond concisely. Explain your routing decision.`,

  model: "gpt-4o",
  temperature: 0.5,
  maxTokens: 2000,
  
  tools: [
    "platform_agents",        // List available agents
    "platform_cortexAgent",   // Get self config
    "platform_swarm_dispatch" // Dispatch to swarm
  ],
  
  canWrite: false,
  canExecuteShell: false,
  
  sandbox: {
    strategy: "none"
  }
};
```

### 3. Agent Interface (AgentDefinition)

```typescript
export interface AgentDefinition {
  id: string;                    // cortex, blueprint, etc.
  name: string;                  // CORTEX, BLUEPRINT, etc. (uppercase)
  description: string;           // One-liner description
  role: string;                  // Detailed role description
  systemPrompt: string;          // Agent's system message
  
  model?: string;                // Override global model
  temperature?: number;          // Precision vs creativity (0.1 - 1.0)
  maxTokens?: number;            // Default 2000-4000
  
  tools: string[];               // What this agent can do
  canWrite: boolean;             // Can write/edit files
  canExecuteShell: boolean;       // Can run shell commands
  
  sandbox?: {
    strategy?: "none" | "sandboxExec" | "bwrap" | "custom";
    profile?: string;
    args?: string[];
    template?: string;
  };
}
```

### 4. All Six Agent Definitions

#### **CORTEX** - Primary Orchestrator
- Role: Routes requests, manages task chains
- Tools: `platform_agents`, `platform_cortexAgent`, `platform_swarm_dispatch`
- CanWrite: NO
- CanExecuteShell: NO
- Temperature: 0.5 (balanced)

#### **BLUEPRINT** - Planner & Architect
- Role: Creates plans, designs solutions, generates `.ai/plan-*.md`
- Tools: `file_read`, `web_search`, `platform_agents`
- CanWrite: YES (plan files only)
- CanExecuteShell: NO
- Temperature: 0.3 (precise planning)

#### **BLACKICE** - Code Reviewer
- Role: Reviews code for correctness, security, performance
- Tools: `file_read`, `platform_agents`
- CanWrite: NO
- CanExecuteShell: NO
- Temperature: 0.2 (strict standards)

#### **DATAWEAVER** - Codebase Reconnaissance
- Role: Finds files, searches patterns, analyzes structure
- Tools: `file_read`, `shell_exec` (grep, find, ls only)
- CanWrite: NO
- CanExecuteShell: LIMITED (read-only)
- Temperature: 0.4 (pattern matching)

#### **GHOST** - Implementation & Code Synthesis
- Role: Implements plans, creates/edits code, executes `/synth` and `/apply`
- Tools: `file_read`, `file_write`, `file_edit`, `shell_exec`
- CanWrite: YES
- CanExecuteShell: YES
- Temperature: 0.3 (precise execution)
- Sandbox: bwrap (if available) for safety

#### **HARDLINE** - Command Executor
- Role: Runs builds, installs, diagnostics, system operations
- Tools: `shell_exec`, `file_read`
- CanWrite: NO
- CanExecuteShell: YES (unrestricted)
- Temperature: 0.1 (deterministic)

### 5. Configuration Changes

**AgentTemplate extended:**

```typescript
export interface AgentTemplate extends AgentDefinition {
  // ... existing fields
  
  agentType: "cortex" | "blueprint" | "blackice" | "dataweaver" | "ghost" | "hardline";
  
  // User-overrideable (from config)
  modelOverride?: string;
  temperatureOverride?: number;
  disabled?: boolean;
}
```

**User config (`~/.pi/agent/extensions/dispath.json`):**

```json
{
  "model": "openai/gpt-4o",
  "agents": {
    "cortex": {
      "model": "openai/gpt-4o"
    },
    "ghost": {
      "temperature": 0.2
    },
    "hardline": {
      "disabled": false
    }
  }
}
```

### 6. Loader Changes (templates/defaults.ts)

**Old approach:**
```typescript
const DEFAULT_TEMPLATES = {
  analyst: { ... },
  executor: { ... },
  researcher: { ... },
  auditor: { ... },
  architect: { ... }
};
```

**New approach:**
```typescript
import { CORTEX_AGENT, BLUEPRINT_AGENT, ... } from "../agents/definitions";

const DEFAULT_AGENTS: Record<string, AgentDefinition> = {
  cortex: CORTEX_AGENT,
  blueprint: BLUEPRINT_AGENT,
  blackice: BLACKICE_AGENT,
  dataweaver: DATAWEAVER_AGENT,
  ghost: GHOST_AGENT,
  hardline: HARDLINE_AGENT
};
```

### 7. Command Changes

**Old:**
```
/dispath 3              # Random agents
/dispath analyst        # Specific type
```

**New:**
```
/dispath-list                    # Show all agents
/dispath:cortex "Route this"     # Invoke specific agent
/dispath:blueprint "Plan this"   # Plan workflow
/dispath:ghost "Implement"       # Execute
```

---

## 🔄 Detailed Implementation Steps

### Step 1: Create Agent Definitions

1. Create `src/agents/definitions/types.ts` with `AgentDefinition` interface
2. Create `src/agents/definitions/cortex.ts` with CORTEX_AGENT export
3. Create `src/agents/definitions/blueprint.ts` with BLUEPRINT_AGENT export
4. Create `src/agents/definitions/blackice.ts` with BLACKICE_AGENT export
5. Create `src/agents/definitions/dataweaver.ts` with DATAWEAVER_AGENT export
6. Create `src/agents/definitions/ghost.ts` with GHOST_AGENT export
7. Create `src/agents/definitions/hardline.ts` with HARDLINE_AGENT export
8. Create `src/agents/definitions/index.ts` with barrel export

### Step 2: Update Templates Module

1. Update `src/templates/types.ts` to extend with `agentType` field
2. Update `src/templates/defaults.ts` to import agent definitions
3. Update `src/templates/utils.ts` to handle agent overrides (model, temperature)
4. Ensure `getTemplateNames()` returns agent IDs

### Step 3: Update Agent Executor

1. Update `src/agents/executor.ts` to respect agent definition tool access
2. Add `canWrite`, `canExecuteShell` checks
3. Add sandbox configuration per agent
4. Ensure agent-specific tools only (e.g., CORTEX doesn't get file_write)

### Step 4: Update Config Loading

1. Update `src/utils/config.ts` to load agent overrides
2. Support `agents` section in config
3. Apply model & temperature overrides
4. Support `disabled` flag per agent

### Step 5: Update Main Handler

1. Update `src/index.ts` to handle new command format
2. Parse `/dispath:cortex` style invocations
3. Route to appropriate agent
4. Update help text

### Step 6: Update UI

1. Update `src/ui/components.ts` to show agent info (role, tools, etc.)
2. Display agent specialization in output
3. Show which agent is running

---

## 📦 Files to Create

```
src/agents/definitions/
├── types.ts              (AgentDefinition interface)
├── cortex.ts             (CORTEX_AGENT)
├── blueprint.ts          (BLUEPRINT_AGENT)
├── blackice.ts           (BLACKICE_AGENT)
├── dataweaver.ts         (DATAWEAVER_AGENT)
├── ghost.ts              (GHOST_AGENT)
├── hardline.ts           (HARDLINE_AGENT)
└── index.ts              (barrel export)
```

## 🔀 Files to Update

```
src/agents/
├── types.ts              (add agentType field to AgentConfig)
└── executor.ts           (respect tool access, sandbox config)

src/templates/
├── types.ts              (extend AgentTemplate)
├── defaults.ts           (import agent definitions)
└── utils.ts              (handle overrides)

src/utils/
└── config.ts             (load agent overrides)

src/
└── index.ts              (new command parsing)

src/ui/
└── components.ts         (agent info display)
```

---

## ✅ Testing Checklist

- [ ] All 6 agent definitions compile cleanly
- [ ] TypeScript strict mode passes, zero warnings
- [ ] Config loading applies agent overrides correctly
- [ ] `/dispath:list` shows all 6 agents with descriptions
- [ ] Agent tools are scoped correctly (no file_write for cortex)
- [ ] Agent prompts are specialized and appropriate
- [ ] Build output is < 50KB
- [ ] No circular imports
- [ ] Agent definitions are immutable (frozen)

---

## 📚 Documentation to Create

- `AGENTS_REFERENCE.md` - Detailed agent role descriptions and tool access
- `CONFIGURATION_AGENTS.md` - How to override agent settings
- `AGENT_DEFINITIONS.md` - Agent specialization architecture

---

## 🎯 Deliverable

**Completion:** Phase 1 is complete when:
1. All 6 agents defined with appropriate system prompts
2. Agent definitions loadable from `src/agents/definitions/`
3. `/dispath:list` shows all agents correctly
4. User config supports agent overrides
5. Build passes with zero warnings
6. Tests pass for agent loading and overrides

**Next:** Phase 2 begins after Phase 1 passes all tests.
