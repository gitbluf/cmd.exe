# Adding Custom Templates - Quick Guide

## TL;DR - Add a Template in 3 Steps

### 1. Copy Template to `src/templates.ts`

Open `.pi/extensions/dispath/src/templates.ts` and add to `DEFAULT_TEMPLATES`:

```typescript
export const DEFAULT_TEMPLATES: Record<string, AgentTemplate> = {
  analyst: { ... },
  // ... other templates ...
  
  // ADD YOUR NEW TEMPLATE HERE:
  mytemplate: {
    role: "My Role",
    description: "What it does",
    systemPrompt: "You are...",
    model: "gpt-4",
    tools: ["file_read", "file_write"],
    maxTokens: 4096,
    temperature: 0.5,
  },
};
```

### 2. Rebuild

```bash
cd .pi/extensions/dispath
npm run build
```

### 3. Use It

```bash
pi
/dispath mytemplate Your mission here
```

## Example: Add a DevOps Agent

```typescript
devops: {
  role: "DevOps Engineer",
  description: "Infrastructure automation and deployment",
  systemPrompt: `You are a cyberpunk DevOps engineer. Your job is to:
1. Design infrastructure as code
2. Set up CI/CD pipelines
3. Automate deployments
4. Monitor and optimize systems

Be pragmatic and security-conscious. Think about operations.`,
  model: "gpt-4",
  tools: ["shell_exec", "file_write", "file_read"],
  maxTokens: 4096,
  temperature: 0.2,
}
```

Then use:
```bash
/dispath devops Set up Docker deployment pipeline
```

## Preset Examples

See `CUSTOM_TEMPLATES_EXAMPLE.ts` for ready-made templates:
- DevOps Engineer
- QA Engineer
- Tech Lead
- Documentation Writer
- Performance Optimizer
- Frontend Specialist
- Database Expert
- Security Specialist

Just copy-paste any of these into `DEFAULT_TEMPLATES`!

## Template Field Meanings

| Field | Description | Example |
|-------|-------------|---------|
| **role** | Agent's job title | "Data Analyst" |
| **description** | One-line summary | "Pattern recognition and analysis" |
| **systemPrompt** | Full instructions | "You are a cyberpunk..." |
| **model** | LLM to use | "gpt-4" |
| **tools** | What agent can access | `["file_read", "shell_exec"]` |
| **maxTokens** | Max response length | 4096 |
| **temperature** | Creativity (0.0-2.0) | 0.3 (deterministic) |

## Temperature Guide

- **0.0-0.2** - Very focused, analytical → Analysts, Auditors, Executors
- **0.3-0.5** - Balanced → Tech leads, Architects
- **0.6-1.0** - Creative, exploratory → Researchers, Brainstormers

## Available Tools

Each agent can use these sandboxed tools:
- **file_read** - Read files in workspace
- **file_write** - Create/write files
- **file_edit** - Edit files inline
- **shell_exec** - Run shell commands

All paths are relative to agent's workspace (`~/.pi/agent/dispath/<id>/`)

## Good System Prompts

Keep them clear and specific:

✅ **Good:**
```
You are a cyberpunk data analyst. Your job is to find patterns
and anomalies in data. Be precise with numbers. Always cite evidence.
Think methodically.
```

❌ **Avoid:**
```
You are an AI assistant.
```

## Test Your Template

```bash
# Spawn your new template
/dispath mytemplate Test mission

# Check it was used
cd ~/.pi/agent/dispath/<timestamp-0>
cat .agent.json | jq '.template.systemPrompt'
```

## Alternative: Override via JSON

If you prefer not to edit TypeScript, you can override in `~/.pi/agent/extensions/dispath.json`:

```json
{
  "agentTemplates": {
    "devops": {
      "role": "DevOps Engineer",
      "description": "Infrastructure automation",
      "systemPrompt": "You are...",
      "model": "gpt-4",
      "tools": ["shell_exec", "file_write"],
      "maxTokens": 4096,
      "temperature": 0.2
    }
  }
}
```

JSON overrides TypeScript templates, so you don't need to rebuild.

## Which Approach?

| Scenario | Use |
|----------|-----|
| Shipping with extension | TypeScript in `src/templates.ts` |
| Local experiments | JSON in `~/.pi/agent/extensions/dispath.json` |
| Both | TypeScript defaults + JSON overrides |

## Troubleshooting

**Template not available**
→ Did you rebuild? `npm run build`
→ Check spelling matches exactly

**Agent using different template**
→ JSON config in `~/.pi/agent/extensions/dispath.json` may be overriding TS
→ Check `.agent.json` in agent workspace to see what was actually used

**Model error**
→ Check API keys in `~/.pi/agent/auth.json`
→ Model name must be valid (e.g., "gpt-4", "claude-opus-4-5")

## Need Help?

See full documentation:
- `TEMPLATES.md` - Complete template reference
- `AGENTS.md` - All agent types explained
- `ARCHITECTURE.md` - Technical details
