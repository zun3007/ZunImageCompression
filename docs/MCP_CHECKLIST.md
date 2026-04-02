# MCP Checklist

Short checklist for keeping Codex Desktop MCP servers healthy on this machine.

## Source Of Truth

- Global config path: `%USERPROFILE%\.codex\config.toml`
- After editing `config.toml`, fully restart Codex Desktop.
- Open a new thread after restart so the tool list is rebuilt.

## Known Good MCP Blocks

```toml
[mcp_servers.playwright]
args = ["-y", "@playwright/mcp@latest", "--browser", "msedge"]
command = "npx"
enabled = true
cwd = "C:\\path\\to\\your\\workspace\\ZunImageCompression"

[mcp_servers.github]
args = ["-y", "@modelcontextprotocol/server-github"]
command = "npx"
enabled = true
env_vars = ["GITHUB_PERSONAL_ACCESS_TOKEN"]

[mcp_servers.sqlite]
args = ["-y", "mcp-sqlite-server"]
command = "npx"
enabled = true

[mcp_servers.context7]
args = ["-y", "@upstash/context7-mcp"]
command = "npx"
enabled = true

[mcp_servers.memory]
args = ["-y", "@modelcontextprotocol/server-memory"]
command = "npx"
enabled = true

[mcp_servers.sequential_thinking]
args = ["-y", "@modelcontextprotocol/server-sequential-thinking"]
command = "npx"
enabled = true

[mcp_servers.filesystem]
args = ["-y", "@modelcontextprotocol/server-filesystem", "C:\\path\\to\\your\\workspace\\ZunImageCompression"]
command = "npx"
enabled = true
```

## Recommended Stack For This Machine

Use now:

- `github`: repo, PR, issue, file operations on GitHub
- `context7`: up-to-date framework and library docs
- `playwright`: browser automation and UI checks
- `sqlite`: inspect local SQLite data and state files
- `memory`: persistent graph memory
- `sequential-thinking`: structured breakdown for larger design/debug tasks
- `filesystem`: scoped filesystem access for the current workspace

Skip for now:

- `git`: mostly redundant because Codex already has shell + git
- `time`: low value compared with built-in time tools
- `everything`: reference/test server, not needed for daily work
- `1mcpserver` and other aggregators: useful later, but add indirection and auth overhead now
- SaaS-specific MCPs such as Sentry, Cloudflare, Render, Notion, Linear:
  add only when the project starts using those systems

## Windows Rules

- Do not rely on `~/code` as MCP `cwd` on Windows.
- Prefer omitting `cwd` unless the server truly needs it.
- If a server needs `cwd`, use an absolute Windows path.
- Keep each CLI argument as its own array item.

Correct:

```toml
args = ["-y", "@upstash/context7-mcp"]
```

Wrong:

```toml
args = ["-y @upstash/context7-mcp"]
```

## Secrets

- Keep GitHub auth in the user environment, not in repo files.
- Required env var for GitHub MCP on this machine:

```powershell
setx GITHUB_PERSONAL_ACCESS_TOKEN "YOUR_NEW_TOKEN"
```

- If a token is pasted into chat or screenshots, rotate it.

## Health Checks

Use these checks after config changes:

- `github`: search or fetch the repo
- `context7`: resolve a known library such as `fastify`
- `memory`: read graph without errors
- `sequential-thinking`: confirm the tool is exposed
- `filesystem`: confirm the workspace is in allowed directories
- `sqlite`: confirm the server starts cleanly
- `playwright`: open a page and take a snapshot

## Known Failure Modes

- Empty `resources` does not mean MCP is broken.
  - Many servers are tool-based, not resource-based.
- `playwright` fails when the configured browser is missing.
  - This machine has Edge at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
  - The server also needs a writable `cwd`; otherwise it may try to write under `C:\Windows\system32`.
- `sqlite` handshake can fail if the package name is wrong.
  - `@modelcontextprotocol/server-sqlite` is not published on npm for this setup.
  - `mcp-sqlite-server` is the working package.
- `filesystem` needs at least one allowed directory.
  - Point it at your local repository path.
- MCP changes usually do not apply to the current thread.

## Quick Recovery Flow

1. Fix `config.toml`.
2. Confirm required env vars exist.
3. Fully restart Codex Desktop.
4. Open a new thread.
5. Re-test `github`, `context7`, `memory`, `sqlite`, and `playwright`.
