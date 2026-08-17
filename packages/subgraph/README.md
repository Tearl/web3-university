# Subgraph

ABIs, Sepolia addresses and deployment blocks are generated from the canonical contract artifacts and deployment manifest:

```bash
pnpm sync
pnpm build
```

Current Sepolia sources:

- CourseMarket `0x50dff16440510f905f2735c2e9290056878922dd`, start block `11491622`
- CourseCertificate `0xfadbd9f71428165829f27cccf624b1bab3cbaa26`, start block `11491622`

After creating a Studio slug and running `graph auth <DEPLOY_KEY>`:

```bash
SUBGRAPH_SLUG=web-3-university-sepolia pnpm deploy:studio -- 0.1.0
```

The UI may show a confirmed transaction receipt before the subgraph catches up. Indexing delay must not be treated as transaction failure.
