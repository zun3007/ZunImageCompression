# Codex Personalization

Reference for the Codex Desktop `Personalization` screen shown in app settings.

## Recommended Values

- `Personality`
  - `Pragmatic`
- `Custom instructions`
  - use the exact content from [AGENTS.md](../AGENTS.md)

## Why This Setup

- `Pragmatic`
  - keeps responses direct, implementation-focused, and low-fluff
- custom instructions from [AGENTS.md](../AGENTS.md)
  - enforce tool-first behavior without excess verbosity
  - reduce hallucination
  - keep debugging and reviews concrete
  - make repo behavior reproducible across machines
  - stay shorter and more maintainable than the previous prompt

## How To Apply In Codex Desktop

1. Open `Settings`.
2. Open `Personalization`.
3. Set `Personality` to `Pragmatic`.
4. Copy the full content of [AGENTS.md](../AGENTS.md).
5. Paste it into `Custom instructions`.
6. Save.

## Source Of Truth

- Repo-level instruction source:
  - [AGENTS.md](../AGENTS.md)
- Global Codex config source:
  - `instructions` in [docs/CODEX_CONFIG.example.toml](./CODEX_CONFIG.example.toml)
- If you update the instruction style later:
  - update [AGENTS.md](../AGENTS.md)
  - update [docs/CODEX_CONFIG.example.toml](./CODEX_CONFIG.example.toml)
  - then sync either the UI `Custom instructions` field or `config.toml`

## Notes

- `AGENTS.md` affects work inside the repository.
- `Custom instructions` affect the Codex app globally.
- `config.toml` can also hold the same global instructions.
- Keeping all three aligned avoids behavior drift between machines.
