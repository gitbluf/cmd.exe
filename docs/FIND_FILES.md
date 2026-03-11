# find_files Tool

The `find_files` tool provides clean, context-efficient file discovery by delegating searches to an isolated DATAWEAVER sub-agent.

## Problem

Traditional file searching pollutes the main agent's context with:
- Directory listings (`read` on every folder)
- File content previews (multiple `read` calls)
- Pattern matching attempts
- Dead-end explorations

This consumes tokens rapidly and degrades model performance.

## Solution

The `find_files` tool spawns a DATAWEAVER sub-agent in an **isolated session** that:
1. Explores the codebase with full `read` access
2. Compiles findings into a structured report
3. Returns **only the curated summary** to the main session

All intermediate reads and explorations stay in the sub-agent's ephemeral context.

## Usage

The LLM calls the tool like any other:

```typescript
find_files({
  query: "authentication middleware",
  scope: "src/"  // optional
})
```

### Parameters

- **query** (required): Natural language description of what to find
  - "authentication middleware"
  - "API route handlers for user management"
  - "configuration files for database connections"
  - "test files for the auth module"

- **scope** (optional): Directory to narrow the search
  - `"src/auth"` - Only search within src/auth
  - `"tests/"` - Only search test directories
  - Omit to search entire project

## How It Works

```
Main Session
  │
  ├─ LLM calls: find_files({ query: "auth middleware" })
  │     │
  │     └─► DATAWEAVER Sub-Agent (isolated session)
  │           ├─ Reads directory structures
  │           ├─ Reads candidate files
  │           ├─ Evaluates relevance
  │           └─► Returns: "Found 3 files:
  │                        - src/middleware/auth.ts (JWT validation)
  │                        - src/middleware/rbac.ts (Role checks)
  │                        - src/utils/auth-helpers.ts (Token utils)"
  │
  └─ Tool Result: [structured file list with descriptions]
      (Main context stays clean!)
```

## When to Use

✅ **Use find_files when:**
- Locating files before reading/editing them
- Exploring unfamiliar codebases
- Finding multiple related files (e.g., "all auth-related modules")
- Searching by purpose/description rather than exact paths

❌ **Don't use find_files when:**
- You already know the exact file path (just use `read`)
- Looking for a single well-known file (e.g., `package.json`)
- Performing simple pattern matching (file names only)

## Configuration

### Mode Availability

Available in both Plan and Build modes by default:

```typescript
// src/modes/index.ts
export const DEFAULT_MODE_CONFIG: ModeConfig = {
  plan: {
    model: "github-copilot/claude-opus-4.6",
    tools: ["read", "find_files"],  // ← read-only exploration
  },
  build: {
    model: "github-copilot/claude-sonnet-4.5",
    tools: ["read", "write", "edit", "bash", "find_files"],  // ← full access
  },
};
```

### Agent Access

Available to agents that benefit from file discovery:

- **blueprint** - Plans implementation, needs to locate target files
- **cortex** - Reviews code, needs to find related modules
- **hardline** - Runs commands, might need to locate scripts/configs
- **dataweaver** - **Does NOT have it** (would cause infinite recursion)
- **ghost** - Gets it via Build mode tools
- **blackice** - Coordination only, no tools

### Model Selection

Uses the `"research"` action type to select a fast/cheap model:

```json
{
  "modelConfig": {
    "default": "gpt-4o",
    "overrides": {
      "research": "gpt-5-mini"  // ← used by find_files
    }
  }
}
```

## Output Format

DATAWEAVER returns a structured list:

```
Found 4 files:

1. src/auth/index.ts
   Main authentication module, exports middleware and utilities
   Relevant: Central auth entry point

2. src/middleware/auth.ts
   JWT validation middleware for Express routes
   Relevant: Handles request authentication

3. src/middleware/rbac.ts
   Role-based access control middleware
   Relevant: Permission checks for authenticated users

4. src/utils/jwt.ts
   JWT token generation and validation utilities
   Relevant: Low-level token operations
```

Output is **truncated at 4000 characters** to keep the main context clean. If truncated, a note directs the LLM to use `read` on specific files.

## Architecture

```
src/tools/
├── find-files.ts    # Tool definition
└── index.ts         # Exports

src/index.ts         # Tool registration
src/modes/index.ts   # Mode tool lists
src/agents/definitions/
├── blueprint.ts     # Includes find_files
├── cortex.ts        # Includes find_files
├── hardline.ts      # Includes find_files
└── dataweaver.ts    # DOES NOT include find_files
```

## Example Queries

### Finding by purpose
```
query: "database migration scripts"
→ Locates migration files in db/migrations/
```

### Finding by feature
```
query: "components for the user profile page"
scope: "src/components"
→ Finds ProfileCard, ProfileSettings, etc.
```

### Finding by pattern
```
query: "test files for the authentication module"
scope: "tests/"
→ Locates auth.test.ts, auth-middleware.test.ts, etc.
```

### Finding configuration
```
query: "environment configuration files"
→ Finds .env, config/*.json, etc.
```

## Benefits

1. **Clean context** - Main session only sees curated results
2. **Better performance** - Less token usage = faster responses
3. **Thoroughness** - DATAWEAVER can explore deeply without bloating context
4. **Model efficiency** - Uses cheap models for reconnaissance
5. **Streaming feedback** - Widget shows progress in real-time

## Limitations

1. **Latency** - Sub-agent spawning adds 2-5s overhead
2. **Not for exact paths** - If you know the path, just use `read`
3. **Truncation** - Output capped at 4000 chars (use `read` for details)
4. **No writes** - DATAWEAVER is read-only (by design)

## Implementation Details

- **Sub-agent runner**: Uses existing `runSubAgent()` infrastructure
- **Tool definition**: Factory pattern captures runtime context
- **Model resolution**: Uses `actionType: "research"` for cheap models
- **Widget display**: Shows DATAWEAVER icon and streaming progress
- **Output storage**: Stored via `storeSubAgentOutput()` for `/synth:output`

See `src/tools/find-files.ts` for the complete implementation.
