# Sandbox Configuration

Tool execution sandboxing for dispath agents.

## Overview

All tool execution (shell_exec, file_read, file_write, file_edit) is sandboxed by default through the pi SDK's workspace isolation mechanism.

Each agent runs in its own isolated workspace (`~/.pi/agent/dispath/<id>/`) with tools restricted to that directory. This prevents agents from accidentally (or intentionally) modifying files outside their workspace.

## Sandbox Strategies

Dispath supports multiple sandboxing strategies that can be configured per agent type:

### 1. None (Default)
```json
{
  "strategy": "none"
}
```

Uses pi SDK's built-in cwd isolation. Tools can only access files within the agent's workspace.

**Risk Level:** Low  
**Performance:** Fastest  
**Use Case:** Standard agent operations

### 2. sandbox-exec (macOS)
```json
{
  "strategy": "sandboxExec",
  "profile": "default"
}
```

Uses macOS's `sandbox-exec` to apply a sandbox profile to shell commands.

**Risk Level:** Very Low  
**Performance:** Moderate (profile loading overhead)  
**Use Case:** Strict security requirements on macOS  
**Requirements:** macOS, sandbox profile defined

### 3. bwrap (Linux)
```json
{
  "strategy": "bwrap",
  "args": ["--ro-bind", "/etc", "/etc"]
}
```

Uses Bubblewrap (bwrap) for container-like isolation on Linux.

**Risk Level:** Very Low  
**Performance:** Moderate (container overhead)  
**Use Case:** Strict security requirements on Linux  
**Requirements:** Linux with bwrap installed

### 4. Custom
```json
{
  "strategy": "custom",
  "template": "chroot /home/user/jail sh -lc '{cmd}'"
}
```

Custom wrapping strategy. `{cmd}` is replaced with the actual command.

**Risk Level:** Depends on template  
**Performance:** Depends on template  
**Use Case:** Custom sandboxing setups  

## Configuration

### Per-Agent Template
```json
{
  "agentTemplates": {
    "executor": {
      "role": "Task Executor",
      "systemPrompt": "...",
      "model": "gpt-4",
      "tools": ["shell_exec", "file_write"],
      "sandbox": {
        "strategy": "bwrap",
        "args": ["--ro-bind", "/usr", "/usr"]
      }
    }
  }
}
```

### Global Default
```json
{
  "sandbox": {
    "strategy": "none"
  },
  "agentTemplates": { ... }
}
```

Agent-level configs override global defaults.

## Architecture

```
Agent
  ├── AgentExecutor
  │   ├── buildTools()
  │   │   ├── createSandboxedBashTool()
  │   │   ├── createSandboxedReadTool()
  │   │   ├── createSandboxedWriteTool()
  │   │   └── createSandboxedEditTool()
  │   └── SandboxConfig
  └── Template
      └── sandbox?: SandboxConfig
```

**Key Components:**

- **SandboxConfig** - Configuration type for sandbox strategies
- **createSandboxedXxxTool()** - Tool factory functions that accept sandbox config
- **wrapBashCommand()** - Wraps shell commands with sandbox adapters
- **adapters** - Strategy implementations (none, sandboxExec, bwrap, custom)

## How It Works

1. **Agent Creation**
   - Agent gets SandboxConfig from template
   - If no config, uses default (strategy: "none")

2. **Tool Building**
   - AgentExecutor creates tools via `buildTools()`
   - Passes SandboxConfig to each tool factory
   - Tools wrap their commands with sandbox adapter

3. **Command Execution**
   - When agent calls shell_exec tool
   - Command is wrapped: `wrapBashCommand(cmd, config)`
   - Wrapped command includes sandbox strategy
   - Shell executes the wrapped command

4. **Isolation**
   - Pi SDK restricts file operations to cwd
   - Sandbox strategy adds OS-level isolation
   - Agent's workspace is isolated from rest of system

## Security Considerations

### Built-in (Always Active)
- File operations scoped to workspace cwd
- Tools can't access files outside workspace
- Prevents accidental filesystem changes

### Optional (Configurable)
- sandbox-exec profile (macOS)
- bwrap container (Linux)
- Custom wrapper script

## Performance Impact

| Strategy | Overhead | Use |
|----------|----------|-----|
| none | ~0% | Standard (recommended) |
| sandboxExec | ~5-10% | High security on macOS |
| bwrap | ~10-20% | High security on Linux |
| custom | Variable | Custom security |

## Examples

### Executor Agent with Container Isolation
```json
{
  "executor": {
    "role": "Task Executor",
    "sandbox": {
      "strategy": "bwrap",
      "args": [
        "--ro-bind", "/usr", "/usr",
        "--ro-bind", "/lib", "/lib",
        "--ro-bind", "/bin", "/bin"
      ]
    }
  }
}
```

### Researcher with Sandbox Profile (macOS)
```json
{
  "researcher": {
    "role": "Information Researcher",
    "sandbox": {
      "strategy": "sandboxExec",
      "profile": "web-browser"
    }
  }
}
```

### Auditor with Custom Wrapper
```json
{
  "auditor": {
    "role": "Security Auditor",
    "sandbox": {
      "strategy": "custom",
      "template": "firejail --noprofile '{cmd}'"
    }
  }
}
```

## Implementation Status

✅ **Infrastructure In Place:**
- SandboxConfig types
- Tool factory functions
- Adapter system
- Configuration support

⏳ **Future Enhancements:**
- Implement sandboxExec wrapping
- Implement bwrap wrapping
- Implement custom template wrapping
- Tool permission system
- Resource limits (CPU, memory)
- Audit logging

## Testing

```bash
# Create auditor with sandbox config
cat ~/.pi/agent/extensions/dispath.json | jq '.agentTemplates.auditor.sandbox'

# Spawn agent
/dispath auditor "Audit this code"

# Check workspace isolation
cd ~/.pi/agent/dispath/<id>
ls -la  # Should only see agent's files
```

## Troubleshooting

**Agent can't execute commands**
→ Check sandbox strategy is supported on your platform
→ For sandboxExec, verify sandbox profile exists
→ For bwrap, verify bwrap is installed: `which bwrap`

**Commands fail with permission errors**
→ Check custom template syntax
→ Ensure wrapper script has proper PATH
→ Test wrapper outside of dispath

**Performance is slow**
→ Try simpler sandbox strategy (or none)
→ sandboxExec and bwrap have overhead
→ Profile-based approaches are faster

## Best Practices

1. **Start with "none"** - Use default isolation
2. **Add sandbox only if needed** - For high-security cases
3. **Test strategy separately** - Before using with agents
4. **Document custom templates** - Explain wrapper behavior
5. **Monitor performance** - Check if sandbox overhead matters

## Future: Permission System

Planned feature for fine-grained tool control:

```json
{
  "auditor": {
    "role": "Security Auditor",
    "tools": ["shell_exec", "file_read"],
    "permissions": {
      "shell_exec": {
        "allowedCommands": ["grep", "find", "ls"],
        "blockedPaths": ["/etc/shadow"]
      },
      "file_read": {
        "allowedExtensions": [".js", ".ts", ".json"],
        "blockedDirs": [".env", ".git"]
      }
    }
  }
}
```

---

**Status:** Infrastructure complete, ready for platform-specific implementations  
**Recommended:** Use "none" strategy for standard operations  
**Advanced:** Configure sandbox-exec/bwrap for high-security requirements
