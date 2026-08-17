# 阶段 E：Chainlink CRE 真实接入

> 状态：代码与本地门禁已完成，等待公网 HTTPS API、CRE 账户/部署权限和 Sepolia 广播  
> 目标链：Ethereum Sepolia（chainId `11155111`）

## 1. 为什么从 Functions 改为 CRE

Chainlink 官方已宣布 Functions 测试网于 2026-06-15 停止、主网于 2026-06-30 停止，新建工作负载应迁移到 Chainlink Runtime Environment（CRE）。

- [Functions 停服与支持网络](https://docs.chain.link/chainlink-functions/supported-networks)
- [Functions 迁移 CRE](https://docs.chain.link/cre/reference/clf-migration)
- [CRE Consumer 合约](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts)
- [CRE Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory)

CRE 不使用 Functions Router、DON ID 或 Functions Subscription。DON 生成签名报告，由 Chainlink `KeystoneForwarder` 验签后调用 Consumer 的 `onReport(metadata, report)`。

## 2. 项目数据流

```text
Student -> CompletionOracle.requestCompletion(courseId)
        -> CompletionRequested(requestId, student, courseId)
        -> CRE EVM Log Trigger
        -> POST /oracle/challenge
        -> GET /oracle/completion (one-time nonce + CRE Secret)
        -> DON identical consensus
        -> signed EVM report
        -> Sepolia KeystoneForwarder
        -> CompletionOracle.onReport
        -> CourseCertificate.mintCertificate

Fallback while Deploy Access is pending:
        -> AWS API signs a short-lived EIP-712 CompletionAttestation
        -> Student/Relayer calls CompletionOracle.fulfillWithSignature
        -> same request state and CourseCertificate.mintCertificate
```

CRE 不直连 PostgreSQL；它只通过公网 HTTPS 访问 API。API 再查询学习进度和 Evidence。

## 3. 已完成的代码

- `CompletionOracle` 实现 CRE `IReceiver`、ERC-165、Forwarder 与 workflow owner/name/ID 校验。
- 请求状态包含 `Pending/Fulfilled/Failed/TimedOut`，并允许失败或超时后创建新请求。
- 未知、延迟或重放的 CRE 报告不会重复铸造。
- `packages/cre-workflow` 监听 `CompletionRequested`，使用 CRE Secret 访问 API，对结果做相同值共识并写链。
- API challenge/completion 返回 `Cache-Control: no-store`，nonce 只能消费一次。
- Web 端每 5 秒读取 CRE 请求状态，履约后自动刷新证书。
- Sepolia 新 Oracle 部署和 workflow 身份固定脚本已提供。
- AWS 签名 fallback 与 CRE 共用同一请求状态机；详见 [`STAGE_E_AWS_SIGNED_FALLBACK.md`](./STAGE_E_AWS_SIGNED_FALLBACK.md)。

## 4. 外部配置

### 4.1 部署公网 API

DON 无法访问 `localhost:4000`。先将 `apps/api` 和 PostgreSQL 部署到公网，并确保：

```dotenv
NODE_ENV=production
PUBLIC_API_URL=https://api.你的域名
CRE_API_BASE_URL=https://api.你的域名
ORACLE_API_KEY=至少-16-位的随机密钥
ORACLE_RATE_LIMIT_PER_MINUTE=60
```

`ORACLE_API_KEY` 同时作为 CRE Secret，不得写入 workflow 配置、Git 或链上报告。

### 4.2 创建 CRE 账户与工作流 owner

1. 按 [CRE CLI macOS/Linux 安装文档](https://docs.chain.link/cre/getting-started/cli-installation/macos-linux) 安装 CLI。
2. 登录 CRE 并建立 Organization；本项目使用 `deployment-registry: "private"`，不绑定钱包、不发送 Ethereum Mainnet Registry 交易。
3. 在 CRE 平台左侧进入 **Organization**，复制 **Organization address**，将它作为 workflow owner。该地址是 CRE 为组织派生的工作流身份，不是 Sepolia 部署钱包地址。
4. 如实际部署功能尚未开放，按官方页面申请 Deploy Access；本地 simulation 不需等待。

```dotenv
CRE_WORKFLOW_OWNER_ADDRESS=0x...
CRE_WORKFLOW_NAME=w3u-complete
```

`packages/cre-workflow/workflow.yaml` 已将 staging/production 均固定为 Private Registry。工作流仍由真实 CRE DON 执行；Private 仅表示生命周期管理使用 Chainlink 托管 Registry，因此无需主网 ETH 和 `CRE_ETH_PRIVATE_KEY`。

### 4.3 准备 workflow 文件

```bash
cp project.example.yaml project.yaml
cp packages/cre-workflow/config.staging.example.json packages/cre-workflow/config.staging.json
cp packages/cre-workflow/secrets.example.yaml packages/cre-workflow/secrets.yaml
```

填写 `config.staging.json` 的公网 API 和新 Oracle 地址；`secrets.yaml` 只引用本地 `ORACLE_API_KEY` 环境变量。三个实际配置文件已加入 `.gitignore`。

## 5. 新 Oracle 部署

在实施日从官方 Forwarder Directory 复核 Sepolia Production Forwarder，写入：

```dotenv
CRE_FORWARDER_ADDRESS=0x...
CRE_REQUEST_TIMEOUT_SECONDS=900
```

预检不输出 RPC Key 或 Oracle API Key：

```bash
pnpm cre:preflight
```

部署和 manifest：

```bash
pnpm --filter @web3-university/contracts deploy:cre:sepolia
pnpm --filter @web3-university/contracts manifest:cre:sepolia
```

将 manifest 中的新 Oracle 地址写入下列四项：

```dotenv
CRE_COMPLETION_ORACLE_ADDRESS=0x...
COMPLETION_ORACLE_ADDRESS=0x...
NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS=0x...
```

同时把它写入 `packages/cre-workflow/config.staging.json`。不立即撤销旧 Oracle 的 `MINTER_ROLE`；先完成 CRE 端到端验收，再用管理员钱包撤销。

## 6. Simulation、部署与身份固定

在项目根目录按 CRE CLI 提示执行：

```bash
cre workflow simulate packages/cre-workflow --target staging-settings --broadcast
cre workflow deploy packages/cre-workflow --target staging-settings
```

Simulation 使用一笔 `CompletionRequested` 交易的 tx hash 和 event index。真实部署完成后，将 CRE 返回的 workflow ID 写入：

```dotenv
CRE_WORKFLOW_ID=0x...
```

然后在 Sepolia 固定 owner/name/ID：

```bash
pnpm --filter @web3-university/contracts configure:cre:sepolia
```

## 7. 最终验收

1. 学生在 Sepolia 已购买课程并完成 100% 学习，API 已生成 Evidence。
2. `requestCompletion(1)` 成功，Etherscan 可见 `CompletionRequested`。
3. CRE 执行记录显示 API 访问和 DON 共识成功。
4. Sepolia 可见 KeystoneForwarder -> `onReport` 交易和 `CertificateIssued`。
5. `requestStatuses(requestId) == Fulfilled`，`certificateOf(student, 1) != 0`。
6. 无 Evidence、false、超时、错误身份、未知 ID 和重放报告均不能错误铸造。
7. Git 中没有 API Key、CRE Secret、RPC Key 或私钥。
