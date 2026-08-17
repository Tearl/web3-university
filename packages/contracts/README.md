# Contracts

## Contracts

- `YDToken`: fixed 1,000,000 YD supply to treasury.
- `CourseMarket`: teacher submission, reviewer approval and YD purchase.
- `CourseCertificate`: oracle-minted, non-transferable ERC721.
- `CompletionOracle`: Chainlink CRE Receiver with Forwarder/workflow validation, request state and local-development fulfillment.

## Compile

```bash
pnpm build
```

The Node compilation catches Solidity/import errors. If Foundry is installed, run the complete
contract test matrix with:

```bash
forge test -vvv
```

Current Foundry baseline: 19 tests.

## Required deployment order

1. YDToken
2. CourseMarket
3. CourseCertificate
4. CompletionOracle
5. Grant `MINTER_ROLE` on CourseCertificate to CompletionOracle
6. Local development only: grant `ORACLE_ROLE` on CompletionOracle to the local oracle operator

`script/DeployLocal.s.sol` performs this order and all three grants. Start Anvil, then run:

```bash
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

The script defaults to Anvil's deterministic development accounts. Override them with
`LOCAL_PRIVATE_KEY`, `LOCAL_TEACHER_ADDRESS`, `LOCAL_ORACLE_ADDRESS`, and
`LOCAL_TREASURY_ADDRESS`. The default private key is public and must never be used on a public
network.

## Sepolia

`script/DeploySepolia.s.sol` only runs on chain `11155111`. It can deploy a fresh contract set or
reuse configured addresses and fill missing roles. It never contains a fallback private key.

From the repository root, configure the ignored `.env` and run:

```bash
pnpm --filter @web3-university/contracts deploy:sepolia
pnpm --filter @web3-university/contracts manifest:sepolia
```

See `docs/STAGE_D_SEPOLIA_DEPLOYMENT.md` for required variables, deterministic seed scripts,
manifest generation and post-deployment verification.
