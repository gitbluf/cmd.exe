# Agent Templates

## Overview

Agent templates define specialized AI personas with their own:
- **Role & Description** - What the agent is and what it does
- **System Prompt** - Detailed instructions for how to behave
- **Model** - Which LLM to use (gpt-4, claude, etc.)
- **Tools** - Which tools the agent can access (file read/write, bash, etc.)
- **Reasoning Style** - Temperature (0.0-2.0) and max tokens

## Built-in Templates (TypeScript)

All templates are defined in **`src/templates.ts`** with full type safety:

### analyst
- **Role**: Data Analyst
- **Temperature**: 0.3 (deterministic, precise)
- **Tools**: file_read, file_write, shell_exec
- **Best For**: Pattern recognition, data analysis, generating insights
- **Personality**: Methodical, precise, data-driven

### executor
- **Role**: Task Executor
- **Temperature**: 0.2 (very focused)
- **Tools**: shell_exec, file_write, file_edit
- **Best For**: Implementation, automation, executing plans
- **Personality**: Pragmatic, careful, efficient

### researcher
- **Role**: Information Researcher
- **Temperature**: 0.7 (creative exploration)
- **Tools**: file_read, file_write, shell_exec
- **Best For**: Exploration, documentation, alternative perspectives
- **Personality**: Curious, thorough, comprehensive

### auditor
- **Role**: Security Auditor
- **Temperature**: 0.2 (critical analysis)
- **Tools**: file_read, shell_exec, file_write
- **Best For**: Code review, vulnerability detection, security validation
- **Personality**: Critical, thorough, security-conscious

### architect
- **Role**: System Architect
- **Temperature**: 0.5 (balanced thinking)
- **Tools**: file_write, file_read, shell_exec
- **Best For**: System design, planning, long-term strategy
- **Personality**: Strategic, big-picture thinking

## Creating Custom Templates

### Option 1: Override via JSON (Easy)

Edit `~/.pi/agent/extensions/dispath.json` to override defaults:

```json
{
  "agentTemplates": {
    "analyst": {
      "role": "My Custom Analyst",
      "systemPrompt": "You are my custom analyst...",
      "model": "claude-3-sonnet",
      "tools": ["file_read", "shell_exec"],
      "maxTokens": 8192,
      "temperature": 0.4
    },
    "devops": {
      "role": "DevOps Engineer",
      "description": "Infrastructure automation",
      "systemPrompt": "You are a DevOps engineer...",
      "model": "gpt-4",
      "tools": ["shell_exec", "file_write"],
      "maxTokens": 4096,
      "temperature": 0.2
    }
  }
}
```

The JSON config **overrides** the TypeScript defaults. Any template in JSON replaces the TS version completely.

### Option 2: Add to TypeScript (Recommended)

For built-in templates that are version-controlled, add directly to `src/templates.ts`:

```typescript
export const DEFAULT_TEMPLATES: Record<string, AgentTemplate> = {
  // ... existing templates ...
  
  devops: {
    role: "DevOps Engineer",
    description: "Infrastructure automation and deployment",
    systemPrompt: `You are a cyberpunk DevOps engineer. Your expertise:
- Infrastructure design and automation
- CI/CD pipeline configuration
- System performance optimization
- Security hardening

Be pragmatic and security-conscious.`,
    model: "gpt-4",
    tools: ["shell_exec", "file_write", "file_read"],
    maxTokens: 4096,
    temperature: 0.2,
  },
};
```

Then rebuild: `npm run build`

## How It Works

### Loading Order

```
1. Load DEFAULT_TEMPLATES from TypeScript
2. Load JSON config from ~/.pi/agent/extensions/dispath.json
3. Merge: JSON templates override TS templates
4. Validate: Check all templates have required fields
5. Use: Validated templates are available for agents
```

### Validation

Each template is validated for:
- ✓ `role` - Required string
- ✓ `systemPrompt` - Required string
- ✓ `model` - Required string
- ✓ `tools` - Required array of strings
- ✓ `temperature` - 0.0 to 2.0
- ✓ `maxTokens` - > 0

Invalid templates are logged with errors and skipped.

## Available Tools

Each template specifies which tools the agent can access:

| Tool | Purpose | Sandbox |
|------|---------|---------|
| **file_read** | Read files | Workspace only |
| **file_write** | Create/write files | Workspace only |
| **file_edit** | Edit files inline | Workspace only |
| **shell_exec** | Run shell commands | Workspace only |

Tools are **sandboxed** - paths resolve relative to agent's workspace (`~/.pi/agent/dispath/<id>/`).

## System Prompts

The system prompt is crucial - it defines the agent's personality and approach.

### Good System Prompt Structure

```
1. Role statement (who you are)
2. Expertise list (what you're good at)
3. Instructions (how to think)
4. Output style (how to communicate)
5. Special considerations (warnings, best practices)
```

### Example: Analyst

```
You are a cyberpunk data analyst. Your expertise:
- Pattern recognition and data analysis
- Statistical reasoning and insights
- Generating clear, actionable intelligence
- Precision and accuracy over speed

Approach each task methodically. Focus on finding patterns, anomalies, and insights.
Always cite your evidence. Be precise with numbers and details.
Your output should be analytical and data-driven.
```

### Example: Executor

```
You are a cyberpunk task executor. Your expertise:
- Implementation and execution
- Command-line automation
- Pragmatic problem solving
- Efficient resource utilization

You are methodical and careful. Never take unnecessary risks.
Always verify changes before committing. Document your work.
Focus on getting things done correctly, not quickly.
```

## Models

The `model` field specifies which LLM to use. Supported values:
- `gpt-4` - OpenAI's GPT-4
- `gpt-3.5-turbo` - OpenAI's faster model
- `claude-opus-4-5` - Anthropic's most capable model
- `claude-3-sonnet` - Anthropic's balanced model
- `claude-3-haiku` - Anthropic's fast model

You must have an API key for the model you choose (configured in `~/.pi/agent/auth.json`).

## Temperature

Controls creativity vs. precision:

- **0.0-0.3**: Deterministic, focused, analytical
  - Good for: Analysts, Executors, Auditors
- **0.4-0.6**: Balanced
  - Good for: Architects, Coordinators
- **0.7-1.0**: Creative, exploratory
  - Good for: Researchers, Brainstormers

Temperature > 1.0 is rarely needed.

## Max Tokens

Controls maximum response length:

- **2048**: Brief, focused responses
- **4096**: Standard, detailed responses
- **8192+**: Comprehensive, thorough responses

## Usage Examples

### List Available Templates

```bash
# When spawning agents, system shows available templates:
/dispath
# Available: analyst, executor, researcher, auditor, architect, devops
```

### Use Custom Template

```bash
# If you added "devops" template
/dispath devops Set up CI/CD for this project
```

### Mix Custom and Built-in

```bash
# Use both built-in and custom templates
/dispath analyst devops researcher Design infrastructure for new service
```

### Multiple of Custom Type

```bash
/dispath 2 devops Configure multi-region deployment
```

## Testing Templates

```bash
# Test with simple mission
/dispath analyst "What files are in this directory?"

# Check what template was used
cd ~/.pi/agent/dispath/<timestamp>-0
cat .agent.json | grep template

# View the full template
cat .agent.json | jq '.template.systemPrompt'
```

## File Structure

```
src/
├── templates.ts      ← Agent template definitions
├── agentExecutor.ts  ← Uses templates to create agents
└── index.ts          ← Loads and merges templates
```

## TypeScript Type

Templates use strict TypeScript typing:

```typescript
interface AgentTemplate {
  role: string;
  description: string;
  systemPrompt: string;
  model: string;
  tools: string[];
  maxTokens: number;
  temperature: number;
}
```

This ensures type safety when defining templates in code.

## Best Practices

1. **Keep system prompts concise** - Too much text dilutes the effect
2. **Be specific** - "Analyze for X" beats "analyze"
3. **Match temperature to task** - Analysts need 0.2, Researchers need 0.7
4. **Include personality** - "cyberpunk" terminology helps set the vibe
5. **Test templates** - Spawn an agent and check `.agent.json` to verify
6. **Version control TS templates** - Keep `src/templates.ts` in git
7. **Use JSON for user overrides** - `~/.pi/agent/extensions/dispath.json` for customization

## Troubleshooting

**Template not loading**
→ Check `~/.pi/agent/extensions/dispath.json` is valid JSON
→ Check template has all required fields
→ Check model name is correct

**Agent using wrong template**
→ Check `.agent.json` in agent workspace
→ JSON config may be overriding TS defaults

**Invalid characters in system prompt**
→ Ensure proper JSON escaping in `dispath.json`
→ Use `\n` for newlines
→ Use `\"` for quotes

## Future Ideas

- [ ] Template management UI in pi
- [ ] Template versioning
- [ ] Template inheritance (base + override)
- [ ] Template marketplace
- [ ] Auto-generate templates from requirements
