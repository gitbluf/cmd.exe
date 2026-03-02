# What is Dispath?

## One-Sentence Definition

**Dispath is a multi-agent orchestration system for pi that spawns specialized AI agents with pre-defined roles, models, and tools to work on your missions.**

## In Plain English

You tell dispath what kind of help you need (analysts, executors, researchers, auditors, architects), give it a task, and it:

1. **Creates isolated workspaces** for each agent (git worktrees)
2. **Gives each agent** its own personality and tools
3. **Sends them on the mission** with streaming feedback
4. **Saves their work** for you to review

All agents run in parallel. Each has their own specialty and reasoning style.

## Real-World Example

```bash
/dispath analyst auditor researcher Security audit this codebase
```

This spawns 3 agents:
- **Analyst** - Examines code patterns and dependencies
- **Auditor** - Finds security vulnerabilities and issues  
- **Researcher** - Documents findings and recommendations

Each works independently in its own workspace, streams output in real-time, and saves results.

## What Makes It Special

### Before Dispath
- You run one LLM at a time
- You juggle multiple prompts manually
- No specialization or persistence
- Single thread of execution

### With Dispath
- **Multiple agents** work in parallel
- **Agent templates** with specialized roles
- **Isolated workspaces** via git worktrees
- **Real-time streaming** as agents work
- **State persistence** - results saved for review
- **Tool sandboxing** - agents can't break things
- **Zero config** - works out of the box

## The 5 Built-in Agents

### 🔍 Analyst
- **Focus**: Pattern recognition, data analysis
- **Personality**: Methodical, precise, evidence-based
- **Temperature**: 0.3 (very deterministic)
- **Best for**: "Analyze this data", "Find patterns"

### ⚡ Executor  
- **Focus**: Implementation, automation
- **Personality**: Pragmatic, careful, efficient
- **Temperature**: 0.2 (extremely focused)
- **Best for**: "Build this", "Automate that"

### 🔬 Researcher
- **Focus**: Exploration, documentation
- **Personality**: Curious, thorough, comprehensive
- **Temperature**: 0.7 (creative exploration)
- **Best for**: "Research this", "Explore options"

### 🛡️ Auditor
- **Focus**: Security, code review
- **Personality**: Critical, skeptical, thorough
- **Temperature**: 0.2 (very critical)
- **Best for**: "Find vulnerabilities", "Review this code"

### 🏗️ Architect
- **Focus**: Design, planning, strategy
- **Personality**: Big-picture thinking, strategic
- **Temperature**: 0.5 (balanced)
- **Best for**: "Design this system", "Plan this"

## How to Use It

### Simplest: Random Agents
```bash
/dispath 3
```
Spawns 3 random agents to help you.

### Specific Agents
```bash
/dispath analyst executor auditor
```
Spawns exactly these 3 agent types.

### With a Mission
```bash
/dispath researcher architect "Design a new payment system"
```

### Multiple of Same Type
```bash
/dispath 2 analyst "Analyze these performance metrics"
```

## Where Agent Work Goes

Each agent gets its own folder:

```
~/.pi/agent/dispath/
├── timestamp-0/    ← Agent 0 workspace
│   ├── .agent.json         (config)
│   ├── .agent-state.json   (results)
│   └── [files it created]
├── timestamp-1/    ← Agent 1 workspace
└── timestamp-2/    ← Agent 2 workspace
```

All linked via git:
```bash
cd ~/.pi/agent/dispath
git worktree list     # See all agents
cd timestamp-0
git log               # See agent's commits
```

## Key Features

✅ **Template-based** - Agents have personalities  
✅ **Streaming** - See output as agents work  
✅ **Isolated** - Each agent in own git worktree  
✅ **Parallel** - All agents run simultaneously  
✅ **Persistent** - Configs and results saved  
✅ **Tool sandboxing** - Safe file/shell access  
✅ **Extensible** - Add custom agent types  
✅ **Zero config** - Works immediately  

## Under the Hood

Dispath uses:
- **pi SDK** - For agent session management
- **OpenAI/Anthropic APIs** - For LLM inference
- **Git worktrees** - For workspace isolation
- **TypeScript** - For type-safe templates

Each agent is a full `AgentSession` created via the pi SDK with:
- Custom system prompt (from template)
- Selected tools (file read/write, bash, etc.)
- Specific model (GPT-4, Claude, etc.)
- Unique workspace directory

## Creating Custom Agents

Two ways to add your own agent type:

### Option 1: Quick JSON Override

Edit `~/.pi/agent/extensions/dispath.json`:
```json
{
  "agentTemplates": {
    "devops": {
      "role": "DevOps Engineer",
      "systemPrompt": "You are a DevOps engineer...",
      "model": "gpt-4",
      "tools": ["shell_exec", "file_write"],
      "temperature": 0.2
    }
  }
}
```

Then use:
```bash
/dispath devops
```

### Option 2: TypeScript (Recommended)

Edit `src/templates.ts` and add to `DEFAULT_TEMPLATES`, then rebuild:
```bash
npm run build
```

See `ADD_TEMPLATE.md` for detailed guide.

## Example Workflows

### Code Review Squad
```bash
/dispath auditor code reviewer architect Review this module
```

### Research Project
```bash
/dispath researcher analyst architect Research Redis vs PostgreSQL
```

### System Migration
```bash
/dispath architect devops executor Plan and execute DB migration
```

### Documentation Sprint
```bash
/dispath docwriter researcher Create comprehensive API docs
```

## Requirements

- An LLM API key (OpenAI, Anthropic, etc.)
- Git (for worktrees)
- Node.js (for pi/dispath)
- Disk space for workspaces

## Documentation

- **[README.md](README.md)** - Quick start
- **[QUICKSTART.md](QUICKSTART.md)** - Quick reference
- **[TEMPLATES.md](TEMPLATES.md)** - Template guide
- **[ADD_TEMPLATE.md](ADD_TEMPLATE.md)** - How to add templates
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical deep dive
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Implementation details
- **[TYPESCRIPT_TEMPLATES.md](TYPESCRIPT_TEMPLATES.md)** - TS templates guide
- **[AGENTS.md](AGENTS.md)** - All agent types

## Quick FAQ

**Q: Do agents run in parallel or sequentially?**
A: Parallel! All agents spawn and run at the same time.

**Q: Can agents talk to each other?**
A: Not yet, but they can share files in workspace. This is a future feature.

**Q: What if an agent fails?**
A: It saves its error state to `.agent-state.json`. You can review and retry.

**Q: Can I see what agents are doing?**
A: Yes! Output streams to console in real-time, and results are saved to the workspace.

**Q: Do agents have internet access?**
A: No, they're sandboxed. They can read/write files and run shell commands in their workspace.

**Q: Can I customize the agents?**
A: Yes! Modify templates via JSON or TypeScript. Change prompts, tools, models, creativity levels.

**Q: Where are results?**
A: Each agent's workspace: `~/.pi/agent/dispath/<timestamp>-<id>/`

## Vision

Dispath is designed for:
- **Multi-agent coordination** - Different specialists on same task
- **Specialized expertise** - Each agent has a role and personality
- **Pragmatic automation** - Get things done with AI
- **Transparency** - See what agents think and do
- **Extensibility** - Add your own agent types

## Next Steps

1. **Try it**: `/dispath 3` - Spawn 3 random agents
2. **Read**: `TEMPLATES.md` - Understand agent types
3. **Customize**: Add your own templates
4. **Explore**: Check agent workspaces at `~/.pi/agent/dispath/`

Welcome to the netrunning future! 🔌

---

**Dispath** - Multi-Agent AI for Pi  
**Cyberpunk-themed** - Because netrunning is cool  
**Type-safe** - Full TypeScript implementation  
**Production-ready** - Battle-tested and stable
