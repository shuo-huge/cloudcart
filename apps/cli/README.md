# @cloudcart/cli

Zero-dependency Node.js CLI for the CloudCart admin API. Designed for humans, scripts and AI agents.

```bash
pnpm cloudcart auth login --url https://store.example.com --email owner@example.com
pnpm cloudcart products list --json
pnpm cloudcart blog create --title "Hello" --slug hello --text-file post.html --publish --json
pnpm cloudcart capabilities --json
```

- Full command reference: [`../../docs/CLI.md`](../../docs/CLI.md)
- Agent instructions: [`../../AGENTS.md`](../../AGENTS.md)
- Tests: `pnpm test:cli`
- Run directly: `node apps/cli/bin/cloudcart.mjs --help`

The package is private and intentionally not published to npm yet. Use `pnpm cloudcart` from the repository root.
