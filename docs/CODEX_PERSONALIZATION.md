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
  - enforce tool-first behavior
  - reduce hallucination
  - keep code review and debugging strict
  - make repo behavior reproducible across machines

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
- If you update the instruction style later:
  - update [AGENTS.md](../AGENTS.md)
  - then copy it back into Codex Desktop `Custom instructions`

## Notes

- `AGENTS.md` affects work inside the repository.
- `Custom instructions` affect the Codex app globally.
- Keeping both aligned avoids behavior drift between machines.
