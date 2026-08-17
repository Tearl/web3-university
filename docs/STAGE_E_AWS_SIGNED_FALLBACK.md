# 阶段 E：AWS 签名 Oracle fallback

> 目标：保留 Chainlink CRE 为主路径；Deploy Access 审批期间，由 AWS API 签发短时 EIP-712 完课证明，学生自行提交到 Sepolia 铸造证书。

## 1. 数据流

```text
Student -> CompletionOracle.requestCompletion(courseId)
        -> AWS API POST /oracle/fallback/attestation
        -> Privy 身份 + 绑定钱包 + 100% evidence + Pending request 校验
        -> AWS 专用 Oracle key 签署 EIP-712 CompletionAttestation
        -> Student/Relayer -> fulfillWithSignature(...)
        -> CompletionOracle 验签并消费同一个 requestId
        -> CourseCertificate.mintCertificate
```

CRE 与 fallback 共用 `requests`、`requestStatuses` 和证书唯一性。两条路径同时到达时，只有第一个 Pending 履约可以铸造；迟到的 CRE 报告会被幂等忽略，迟到的 fallback 会被拒绝。

## 2. 签名安全边界

EIP-712 domain 固定为：

```text
name: Web3UniversityCompletionOracle
version: 1
chainId: 当前链
verifyingContract: CompletionOracle 地址
```

签名覆盖：

```text
requestId, student, courseId, evidenceHash, tokenURI, deadline
```

- `requestId` 是链上一次性 nonce，Fulfilled/Failed/TimedOut 后不能重放。
- `deadline` 默认 5 分钟，过期签名在链上拒绝。
- domain 阻止跨链、跨 Oracle 合约重放。
- evidence 和 metadata URI 均被签名，前端或 Relayer 不能篡改。
- 签名接口必须通过 Privy 登录，只向绑定钱包且已生成服务端 evidence 的学生开放。
- `ORACLE_ROLE` 仍仅用于 Anvil，本方案不会给 AWS 钱包直接发交易或授予该角色。

## 3. 创建专用 signer

使用新的测试网专用钱包；不要复用部署、Treasury、Teacher、Student 或主钱包：

```bash
cast wallet new
```

保存两项，但不要发送给他人：

```dotenv
FALLBACK_ORACLE_SIGNER_ADDRESS=0x公开地址
FALLBACK_ORACLE_PRIVATE_KEY=0x私钥
FALLBACK_ATTESTATION_TTL_SECONDS=300
```

私钥只存 AWS Secrets Manager `/w3u/staging/fallback-oracle-private-key`；signer 地址和 TTL 可作为 ECS 普通环境变量。API 启动时会验证私钥派生地址与 signer 地址一致。

当前实现由 ECS 进程从 Secrets Manager 注入专用测试网私钥并签名。生产强化可将 `FallbackOracleSigner` 实现替换为 AWS KMS `ECC_SECG_P256K1` 签名器，API 路由和合约无需改变。

## 4. 部署组合 Oracle

根 `.env` 同时配置 CRE 和 fallback 的公开/私密项后执行：

```bash
pnpm cre:preflight
pnpm --filter @web3-university/contracts deploy:cre:sepolia
pnpm --filter @web3-university/contracts manifest:cre:sepolia
```

`DeployCREOracleSepolia` 会：

1. 部署或复用 `CompletionOracle`。
2. 保留 Sepolia Production KeystoneForwarder。
3. 设置 Organization workflow owner。
4. 设置 `fallbackOracleSigner`。
5. 授予新 Oracle `CourseCertificate.MINTER_ROLE`。

将 manifest 中的新 Oracle 地址同步到：

```dotenv
CRE_COMPLETION_ORACLE_ADDRESS=0x...
COMPLETION_ORACLE_ADDRESS=0x...
NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS=0x...
```

并同步 ECS/Cloudflare 构建配置。先完成端到端验收，再撤销旧 Oracle 的 `MINTER_ROLE`。

## 5. AWS 与前端发布

ECS 新增 Secret：

```text
FALLBACK_ORACLE_PRIVATE_KEY -> /w3u/staging/fallback-oracle-private-key
```

ECS 新增普通环境变量：

```dotenv
FALLBACK_ORACLE_SIGNER_ADDRESS=0x...
FALLBACK_ATTESTATION_TTL_SECONDS=300
```

API `/health` 的 `features.fallbackOracle=true` 表示签名器已正确加载。更新 API 镜像后，重新构建并部署 Cloudflare Worker，使新 ABI 和 fallback UI 生效。

## 6. 验收

1. 学生 100% 完课并生成 evidence。
2. 第一笔钱包交易产生 `CompletionRequested`。
3. API 只为同一 student/course/Pending request 返回签名。
4. 第二笔钱包交易调用 `fulfillWithSignature`，产生 `CompletionFulfilled` 和 `CertificateIssued`。
5. 修改 URI、evidence、deadline、requestId 或签名均失败。
6. 签名过期、未知请求、已履约请求和未绑定钱包均失败。
7. CRE 后续对同一请求回报时不会重复铸造。
8. Git、日志和前端构建产物中没有 fallback 私钥。

