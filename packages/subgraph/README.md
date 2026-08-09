# Subgraph

Before deployment, replace both zero addresses and `startBlock: 0` in `subgraph.yaml` with actual deployed addresses and deployment blocks.

```bash
pnpm codegen
pnpm build
```

The UI may show a confirmed transaction receipt before the subgraph catches up. Indexing delay must not be treated as transaction failure.
