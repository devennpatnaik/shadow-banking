# Dashboard (retired deliverable)

Spec §14 originally listed a live-data dashboard. That interface is **not** being built.

The operator and agent surface is the terminal CLI:

```bash
pnpm sb --help
pnpm sb status --json
```

See [`../packages/cli`](../packages/cli/), [`../AGENTS.md`](../AGENTS.md), and [`.claude/CLAUDE.md`](../.claude/CLAUDE.md).

Do not add a web or graphical UI here.
