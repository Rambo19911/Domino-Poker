---
description: Use Codex as an MCP advisory and review partner for substantial work.
activation: always
---

# Codex Advisory Workflow

- Use the `codex-advisor` MCP server for substantial implementation work.
- Before editing files, ask Codex to critique the plan when the task is non-trivial.
- Before the final answer, ask Codex to review the current git diff and identify blocking issues.
- Do not run `codex`, `codex exec`, `codex.cmd`, or `codex.exe` through the terminal; use MCP tools only.
- Start with the `codex` MCP tool and continue the same task with `codex-reply` using the returned `threadId`.
- Internal Codex-to-Gemini advisory/review messages must be in English.
- Final user-facing answers remain in Latvian unless the user explicitly asks otherwise.
- If Codex reports a blocking final-review issue, fix it before claiming completion.
