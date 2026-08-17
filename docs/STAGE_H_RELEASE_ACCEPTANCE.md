# 阶段 H：系统验收与交付

> 网络：Sepolia（chainId `11155111`）  
> 状态：已完成（2026-08-17；CRE DON 主路径仍等待 Deploy Access，当前发布使用已验收的 AWS fallback）  
> 原则：自动化测试不保存或代管 MetaMask 私钥；真实签名交易由测试钱包人工确认

## 1. 本阶段交付

- Playwright 桌面端和移动端冒烟测试、公开 API 验收与关键错误状态测试。
- Sepolia 只读验收脚本：RPC bytecode、购买、证书、API、Subgraph 和 Uniswap Pool 一次核对。
- 仓库 Secret 扫描，阻止 `.env`、私钥、Privy Secret、RPC Key 和 AWS Access Key 被提交。
- 统一门禁命令、发布手册、环境变量分级、回滚方案、测试数据和 8 分钟答辩脚本。
- 钱包交易人工验收清单；每个“完成”必须能指向 receipt、数据库记录或 Subgraph 实体。

## 2. 自动化命令

快速代码门禁：

```bash
pnpm security:check
pnpm check
forge fmt --check --root packages/contracts
forge test --root packages/contracts -vvv
pnpm subgraph:build
pnpm cloudflare:build
```

浏览器验收默认访问 `.env` 中的 `E2E_BASE_URL` 和 `E2E_API_URL`。本地首次运行若没有 Chrome，可执行 `pnpm exec playwright install chromium`，并把 `PLAYWRIGHT_BROWSER_CHANNEL` 设为空或 `chromium`；已安装 Chrome 时无需下载：

```bash
pnpm e2e
```

对已发布环境运行：

```bash
E2E_BASE_URL=https://你的Cloudflare地址 \
E2E_API_URL=https://你的ECS地址 \
pnpm e2e
```

Sepolia 只读主链路验收从被 Git 忽略的 `.env` 读取公开地址和服务 URL，不广播交易、不读取或打印私钥：

```bash
pnpm stage-h:live
```

全部门禁可以一次执行：

```bash
pnpm stage-h:check
```

## 3. 覆盖矩阵

| 场景 | 自动化层 | 证据 |
|---|---|---|
| 教师提交、Reviewer 权限和 receipt 对账 | API Vitest + Foundry + 人工钱包 | draft/课程 DB 记录、`CourseSubmitted`/审核 receipt |
| Subgraph 正常、RPC 降级、索引延迟、索引错误 | API Vitest + Playwright + live script | `source`、`degraded`、`_meta` |
| 评论登录、空白、限频、软隐藏、XSS 输出 | API Vitest | HTTP 状态和持久化记录 |
| 无购买访问视频、伪造钱包 | API Vitest + Playwright 匿名请求 | 401/403，不返回 `videoKey` |
| approve/buy、重复购买、转账失败 | Foundry + Sepolia 人工钱包 | receipt、`hasPurchased` |
| 学习防刷、唯一 evidence、Oracle 重放/超时 | API Vitest + Foundry | `OracleEvidence`、request 状态、revert |
| AWS fallback 签名错误/过期/重放 | API Vitest + Foundry + Sepolia 人工钱包 | EIP-712 校验和 NFT receipt |
| CRE Forwarder/owner/workflow/report 重放 | Foundry | `CompletionOracleCRE.t.sol` |
| DEX 过期 deadline、最小到账、非 YD 输出 | Foundry | `StageFDex.t.sol` revert |
| 桌面/移动首页、课程、兑换页 | Playwright | HTML report、失败截图/trace（不录制可能包含钱包信息的视频） |

钱包拒绝签名、MetaMask 网络切换以及真实交易确认不能在不托管私钥的 CI 中安全自动化，放在第 7 节人工清单中。

### 本轮自动化结果

- 仓库 Secret 扫描：171 个候选文件，0 个发现。
- API Vitest：6 个测试文件，42/42 通过。
- Foundry：3 个测试套件，26/26 通过。
- Playwright：桌面与移动端共 12/12 通过。
- Sepolia live acceptance：`status=ready`，8 个项目合约/DEX 地址存在 bytecode，courseId 1 已购买，tokenId 1 已铸造。
- Subgraph 验收区块 `11501533`，与当时链头一致，`lagBlocks=0`、`hasIndexingErrors=false`。
- `pnpm check`、Subgraph build、Next production build 和 Cloudflare build 全部通过。
- E2E 发现并修复了移动端菜单无点击逻辑的问题；修复后的线上桌面/移动回归 2/2 通过。

## 4. 环境变量与保存位置

| 类型 | 变量 | 保存位置 |
|---|---|---|
| 前端公开 | `NEXT_PUBLIC_PRIVY_APP_ID`、chainId、RPC URL、API URL、合约地址、Uniswap 地址 | Cloudflare 构建变量；RPC Key 必须限制域名和网络 |
| API 普通 | `NODE_ENV`、chainId、公开地址、TTL、限频、startBlock、公开 URL | ECS Task Definition environment |
| API Secret | `DATABASE_URL`、Privy Secret/Verification Key、Oracle API Key、视频签名 Secret、fallback signer 私钥、Subgraph URL | AWS Secrets Manager `/w3u/staging/*`，ECS 只引用 ARN |
| 部署专用 | Deployer/Teacher/Treasury 私钥 | 仅本地被忽略的 `.env` 或临时 shell；不进入 ECS/Cloudflare |
| CRE | API Key secret、workflow 配置 | CRE Secrets 和被忽略的 `packages/cre-workflow/*staging*` |
| E2E | `E2E_BASE_URL`、`E2E_API_URL` | 本地 `.env` 或 CI 普通变量，不含认证凭据 |

完整字段以 [`.env.example`](../.env.example) 为准。任何 `NEXT_PUBLIC_*` 都会进入浏览器产物，绝不能写私钥或后端 Secret。

## 5. 测试账户和演示数据

公开地址可以写入文档，私钥不能：

| 用途 | 地址/数据 |
|---|---|
| Student | `0xbC41A64280E546ED5558B08e386e4FD8d0142757` |
| Teacher | `0x574f7d47E9748f1A45aBAa0fe9AE6f4eC8db3C4C` |
| Course | courseId `1`，价格 `4 YD`，Active |
| Purchase receipt | `0x102bc66afb9364d6c3d27a9ce6523ef794ac20cbd1c3369c71e74ba905261f79` |
| Certificate | tokenId `1`，不可转让 |
| Subgraph | Studio `web-3-university-sepolia`，版本 `0.1.0` |
| DEX | WETH/YD 与 mUSDC/YD，fee `0.3%`，仅测试资产 |

合约、Pool、Position 和部署 receipt 的权威清单位于：

- `packages/contracts/deployments/sepolia.json`
- `packages/contracts/deployments/sepolia-cre.json`
- `packages/contracts/deployments/sepolia-dex.json`

## 6. 回滚方案

### API / ECS

1. 在 ECS 服务 Deployments 中确认当前失败 revision 和上一个 Healthy revision。
2. 把服务 Task Definition 切回上一个 revision，Force new deployment。
3. 等目标组 Healthy、旧任务 drain 完成，再检查 `/health`。
4. Secret 不随镜像回滚；若故障来自 Secret rotation，先恢复上一 Secret version，再重新部署。
5. Prisma migration 当前必须保持向后兼容。回滚应用前不得直接删除新列；数据库先做 RDS snapshot，破坏性变更使用后续修复 migration。

### Web / Cloudflare

1. 在 Worker `web3-university-web` 的 Deployments 中选择上一个成功版本并 Rollback。
2. 验证 `/`、`/courses/1`、`/profile`、`/swap` 与 API CORS。
3. 当前阶段 H 发布版本为 `bc3369f2-6de3-4474-93bf-fde4b350f0a0`；上一阶段 G 版本 `70da35be-2d84-42ef-9f03-8f22b357c02b` 可作为已知回滚目标。

### Subgraph

Studio 版本不可原地修改。部署新 semver 版本，验证 Healthy 后才更新 `/w3u/staging/subgraph-url` 并滚动 ECS。失败时把 Secret 恢复为上一 Development Query URL；链上 receipt 仍是即时事实，API 可降级 RPC。

### 合约

当前合约不是代理，不能覆盖升级或传统回滚。发生严重问题时先暂停可暂停入口/撤销角色，部署新合约，重新授权并更新 deployment manifest、API、Web 和 Subgraph。不得删除旧 receipt 或伪装地址未变化。

## 7. Sepolia 人工主路径清单

1. 用 Teacher Privy 身份进入 `/admin`，提交草稿并确认 `submitCourse`；Reviewer approve。
2. 用 Student 登录，绑定上表 Student 钱包，确认网络为 `Sepolia · 11155111`。
3. 在 `/swap` 用 mUSDC 或 WETH 换 YD，核对输入减少、YD 增加和 receipt。
4. 课程页执行有限 `approve` 和 `buy`，核对两笔 receipt；已有课程 1 时只读取历史购买，不重复广播。
5. 发布评论，刷新后仍可见；未购买钱包不能读取视频。
6. 完成两节课共 5 分钟进度，申请课程完成认证。
7. CRE 未获批期间选择“使用 AWS 签名完成”，确认 `fulfillWithSignature`。
8. 个人中心核对 1 笔购买、交易哈希、tokenId 1 证书和 Subgraph 已同步。
9. 拒绝一次无价值测试签名或切到错误网络，页面应保持未完成且不生成 DB/链上假成功。

## 8. 8 分钟答辩脚本

| 时间 | 演示内容 | 关键说明 |
|---:|---|---|
| 0:00–0:40 | 架构图和 Sepolia 页脚 | 链上管所有权与支付，PostgreSQL 管内容，Subgraph 管事件索引 |
| 0:40–1:30 | Privy 登录和钱包绑定 | DID 与交易钱包分离，资料修改还需 EIP-712 一次性签名 |
| 1:30–2:20 | 教师中心与课程 1 | Teacher/Reviewer 角色、链下草稿和链上 courseId 对账 |
| 2:20–3:15 | Uniswap `/swap` | mUSDC/WETH 均为测试资产，有限授权、滑点和 deadline |
| 3:15–4:10 | 4 YD 购买 | `approve + buy` 两笔交易，receipt 优先于索引延迟 |
| 4:10–5:10 | 评论、视频和 5 分钟进度 | 视频 URL 短时签名，未购买拒绝，服务端限制进度跃增 |
| 5:10–6:20 | Oracle 和 NFT | CRE 主路径等待审批；当前演示 AWS EIP-712 fallback，二者竞争同一 Pending request |
| 6:20–7:15 | 个人中心与 Subgraph | 展示购买 tx、tokenId 1、`lagBlocks=0`、无索引错误 |
| 7:15–8:00 | 失败路径和门禁 | 重放、超时、错误网络、DEX 滑点均安全失败；展示 `stage-h:check` 结果 |

## 9. 发布判定

满足以下条件可标记阶段 H 完成：

- `pnpm stage-h:check` 全部通过。
- `pnpm stage-h:live` 返回 `status=ready`。
- 第 7 节人工主路径通过，并记录本轮新增交易 receipt；已有事实不通过重复购买重造。
- Cloudflare 与 ECS 当前版本 Healthy，RDS 有可恢复快照。
- CRE Deploy Access 如仍未获批，发布说明必须明确 AWS fallback 是当前 Oracle 演示路径，不能宣称 DON report 已完成。
