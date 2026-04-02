# Codex Setup

Reference setup for reinstalling Codex on a new Windows machine for this repo.

## Files To Restore

- Global Codex config template: [docs/CODEX_CONFIG.example.toml](D:/Project/ZunImageCompress/docs/CODEX_CONFIG.example.toml)
- Project instructions: [AGENTS.md](D:/Project/ZunImageCompress/AGENTS.md)
- Personalization guide: [docs/CODEX_PERSONALIZATION.md](D:/Project/ZunImageCompress/docs/CODEX_PERSONALIZATION.md)
- MCP health checklist: [docs/MCP_CHECKLIST.md](D:/Project/ZunImageCompress/docs/MCP_CHECKLIST.md)

## Target Paths

- Codex global config:
  - `C:\Users\<YourUser>\.codex\config.toml`
- Repo instructions:
  - clone repo so [AGENTS.md](D:/Project/ZunImageCompress/AGENTS.md) stays at project root

## One-Time Machine Requirements

- Install Node.js so `npx` is available
- Install Microsoft Edge
- Sign in to Codex Desktop
- Clone this repository locally

## GitHub Token

Do not store the token in the repo.

Set it in the Windows user environment:

```powershell
setx GITHUB_PERSONAL_ACCESS_TOKEN "YOUR_NEW_GITHUB_PAT"
```

After setting it, fully restart Codex Desktop.

## Recommended Global Config

Copy [docs/CODEX_CONFIG.example.toml](D:/Project/ZunImageCompress/docs/CODEX_CONFIG.example.toml) into:

```text
C:\Users\<YourUser>\.codex\config.toml
```

Then adjust these values if needed:

- `cwd` under `playwright`
- workspace path under `filesystem`

For this repo on the current machine, the expected workspace path is:

```text
D:\Project\ZunImageCompress
```

## Personalization Settings

In Codex Desktop `Settings -> Personalization`:

- set `Personality` to `Pragmatic`
- paste the full content of [AGENTS.md](D:/Project/ZunImageCompress/AGENTS.md) into `Custom instructions`

Reference guide:

- [docs/CODEX_PERSONALIZATION.md](D:/Project/ZunImageCompress/docs/CODEX_PERSONALIZATION.md)

## Why These MCP Servers

- `github`
  - repo, file, issue, and PR operations
- `context7`
  - current library/framework docs
- `playwright`
  - browser automation and UI smoke tests
- `sqlite`
  - inspect Codex state or other local SQLite files
- `memory`
  - persistent graph memory
- `sequential_thinking`
  - structured decomposition for harder debugging and design tasks
- `filesystem`
  - scoped access to the current workspace

## Post-Install Verification

Run these checks from a fresh Codex thread:

1. `github`
   - search `zun3007/ZunImageCompression`
2. `context7`
   - resolve `fastify`
3. `memory`
   - read graph
4. `sqlite`
   - list databases in `C:\Users\<YourUser>\.codex`
5. `filesystem`
   - list allowed directories
6. `sequential_thinking`
   - run a one-step smoke test
7. `playwright`
   - open `https://example.com`
   - take a snapshot

## Known Notes

- MCP changes usually need:
  - full Codex Desktop restart
  - new thread
- `playwright` previously failed because:
  - Chrome was not installed
  - server tried to write under `C:\Windows\system32`
- Current fix:
  - use Edge via `--browser msedge`
  - set `cwd` to the workspace
- `sqlite` previously failed because the package name was wrong
  - wrong: `@modelcontextprotocol/server-sqlite`
  - correct: `mcp-sqlite-server`

## Recovery Flow

1. Restore [docs/CODEX_CONFIG.example.toml](D:/Project/ZunImageCompress/docs/CODEX_CONFIG.example.toml) into Codex config.
2. Set `GITHUB_PERSONAL_ACCESS_TOKEN`.
3. Restart Codex Desktop.
4. Open a new thread.
5. Re-run the verification list above.
