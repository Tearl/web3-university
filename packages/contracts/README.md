# Contracts

## Contracts

- `YDToken`: fixed 1,000,000 YD supply to treasury.
- `CourseMarket`: teacher submission, reviewer approval and YD purchase.
- `CourseCertificate`: oracle-minted, non-transferable ERC721.
- `CompletionOracle`: request/fulfillment boundary for Chainlink Functions.

## Compile

```bash
pnpm build
```

The current Node compilation catches Solidity/import errors. Install Foundry separately to implement and run the `.t.sol` test suite.

## Required deployment order

1. YDToken
2. CourseMarket
3. CourseCertificate
4. CompletionOracle
5. Grant `MINTER_ROLE` on CourseCertificate to CompletionOracle
6. Grant `ORACLE_ROLE` on CompletionOracle to the Chainlink callback adapter/router design
