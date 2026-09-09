# Working on Devonian

Devonian is a TypeScript library for bidirectional data portability. Its native resource API uses Atomic Data / JSON-AD; the existing row API remains available for compatibility.

- Use Node.js 22 and pnpm 10, matching CI and package.json.
- Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm prettier:check`, `pnpm test`, and `pnpm build` before merging.
- Keep public exports in `src/main.ts` and document public behavior in README.md and docs/atomic-data.md.
- Add behavioral tests under __tests__, including connector failures and restart/replay behavior for synchronization changes.
- Treat subject URLs as identities. Never deduplicate resources by content or confuse external IDs with storage positions.
- Scope external identifiers by connector instance and entity type. Preserve their string/number distinction.
- Preserve unmapped properties during synchronization. Property removal must be explicit.
- Do not claim distributed convergence, Atomic Server transport, or signed Commit support without implementing and testing those protocols.
- Keep network access out of unit tests; use deterministic connector fakes.
- Avoid editing generated HTML docs directly. Regenerate them with TypeDoc when changing that documentation surface.
