# Web3 University 开发计划书

> 版本：v1.0  
> 制定日期：2026-08-12  
> 适用范围：从当前仓库状态推进到可在 Sepolia 演示的完整 DApp

## 1. 项目目标

Web3 University 是一个半中心化在线课程 DApp：课程状态、YD 支付、购买凭证和结业证书上链，课程内容、用户资料、评论和学习进度保存在 PostgreSQL。

本计划的最终交付目标是：

- 教师能提交课程，审核员能审批、拒绝和下架课程。
- 学生能登录并连接钱包，使用 YD 完成授权和购买。
- API 通过链上购买事实控制课程内容访问，不信任客户端声明。
- 学习进度达标后生成可审计 evidence，并通过 Oracle 铸造不可转让证书。
- 课程、购买和证书事件可由 The Graph 查询，并有自动化测试和演示手册。

## 2. 当前基线

### 已完成

- pnpm monorepo 以及 Web、API、Contracts、Subgraph、Shared 工作区骨架。
- Next.js 静态课程页、课程详情页、个人中心和管理页。
- Fastify 健康检查、Oracle 和资料签名的安全边界骨架。
- Prisma 数据模型，包括用户、课程详情、课时、评论、学习进度、nonce 和 Oracle evidence。
- `YDToken`、`CourseMarket`、`CourseCertificate`和 `CompletionOracle` 四份合约。
- 合约测试矩阵和本地部署/授权脚本已编写并通过 Solidity 编译。
- Subgraph schema、mapping 和构建骨架。
- P0–P4 代码已完成：本地链部署、YD 购买、Prisma 课程 API、购买校验视频接口和 Privy + EIP-712 资料签名。
- `pnpm check` 通过。

### 当前阻塞和外部依赖

- Sepolia RPC、测试 ETH、Privy 应用凭据、The Graph 部署配置和 Chainlink subscription 尚未配置。
- 课程展示文案仍有部分来自 `demo-data.ts`，P5 再切换为 Subgraph 查询。
- Privy 真实登录联调只缺 Dashboard 凭据，无需再修改业务代码。

## 3. 开发原则

1. 先本地链，后 Sepolia；先主链路，后 DEX 和视觉打磨。
2. 每个阶段必须通过验收门禁，才进入下一阶段。
3. 购买、课程状态和证书所有权以合约为准；数据库和 Subgraph 只是内容库或索引。
4. 任何写交易在请求签名前先模拟，成功与否以 receipt 为准。
5. API 从已验证的身份中取得钱包地址，不相信 body/query 中的身份声明。
6. 私钥、RPC key、Privy secret、Oracle key 和对象存储凭据不进入 Git。

## 4. 阶段计划

### P0：完成本地合约验收（1 天）

**目标**：证明四份合约在本地链上能完成课程购买和证书铸造闭环。

**任务**

1. 安装 Foundry，确认 `forge --version`、`anvil --version`、`cast --version`。
2. 运行 `forge fmt --check` 和 `forge test -vvv`，修复所有失败。
3. 启动 Anvil，运行 `DeployLocal.s.sol`，记录合约地址和部署区块。
4. 用 `cast` 完成授权教师、提交课程、审批、向学生转 YD、`approve`、`buy`、请求完成度和铸造证书。
5. 整理可重复的本地链操作手册和地址文件。

**交付物**

- Foundry 测试报告。
- 本地合约地址和部署记录。
- 可复现的 `cast` 主链路命令。

**验收门禁**

- 合约测试全部通过。
- treasury 收到准确数量的 YD，`hasPurchased` 为 `true`。
- receipt 中可找到 `CoursePurchased`，证书不能被转让。

### P1：钱包、Provider 和读链（2–3 天）

**目标**：前端连接真实钱包，并从 Anvil 读取 YD 余额和课程状态。

**任务**

1. 在根布局加入 Privy、wagmi 和 React Query Provider；开发时允许先使用 wagmi 注入钱包。
2. 在 `packages/shared` 集中定义 Anvil/Sepolia chain、合约地址、ABI 和地址校验。
3. 从合约产物自动生成或导出 ABI，禁止页面手写 ABI。
4. 将页头按钮改为真实连接流程，展示未连接、连接中、已连接、网络错误四种状态。
5. 用 `useReadContract` 读取 YD 余额、allowance、`courses(id)` 和 `hasPurchased`。
6. 用本地链数据替换详情页的链上示例字段。

**交付物**

- Provider 和钱包组件。
- 共享 chain/address/ABI 配置。
- 合约读取 hooks 及明确的钱包状态 UI。

**验收门禁**

- 断开钱包时不发起需账户的请求。
- 链 ID 错误时不允许交易，并能引导切换网络。
- 页面显示与 `cast call` 一致的余额、课程和购买状态。

### P2：YD 授权与购买闭环（2–3 天）

**目标**：学生能通过页面完成 `approve -> buy -> receipt -> 状态刷新`。

**任务**

1. 建立购买状态机：未连接、网络不匹配、YD 不足、待授权、授权确认中、可购买、购买确认中、已购买。
2. 写交易前运行 `simulateContract`，再发送并等待 receipt。
3. 分类处理用户拒签、余额不足、allowance 不足、重复购买、课程下架和 RPC 超时。
4. 交易成功后以 receipt 立即反馈，并重新读取余额和购买资格。
5. 增加组件测试，覆盖状态转换和错误文案。

**验收门禁**

- treasury 余额增量等于课程价格。
- 刷新页面后仍显示已购买。
- 用户拒签不被误报为链上交易失败。

### P3：PostgreSQL 与课程内容 API（3–4 天）

**目标**：课程内容落库，视频访问由链上购买资格保护。

**任务**

1. 创建第一份 Prisma migration 和可重复 seed 数据。
2. 建立单例 PrismaClient，并在 Fastify 关闭时断开连接。
3. 实现 `GET /courses/:courseId` 和 `GET /courses/:courseId/lessons`。
4. 实现仅开发环境固定教师可用的课程与课时写入接口。
5. 建立 viem RPC 客户端，视频接口调用 `hasPurchased(wallet, courseId)` 后才签发短时效 URL。
6. 统一 BigInt JSON 序列化和 API 错误格式。
7. 用 Fastify `inject` 覆盖 200、400、401/403 和 404。

**验收门禁**

- 未购买用户请求视频返回 403，已购买用户获得短时效 URL。
- 数据库课程内容的增删不会改变链上购买事实。
- API 测试不依赖真实公网 RPC。

### P4：Privy 身份与 EIP-712 资料签名（3–4 天）

**目标**：建立“Privy 登录用户 + 绑定钱包 + 一次性签名”的完整身份链。

**任务**

1. 实现统一 Privy access token 验证 hook，从 token 中取得用户和绑定钱包。
2. `/profile/nonce` 将随机 nonce 持久化，过期时间为 5 分钟。
3. 定义 `UpdateProfile` EIP-712 domain 和 types，前端调用 typed-data 签名。
4. 后端恢复签名地址，同时校验 Privy 用户、绑定钱包、nonce、domain、chainId 和过期时间。
5. 在同一数据库事务中消费 nonce 并更新资料。
6. 覆盖重放、过期、token/钱包混用、篡改 username 和错误 domain/chainId 攻击。

**验收门禁**

- 合法签名只能成功一次。
- 上述所有攻击场景均失败，且日志不泄漏 token 和签名。

### P5：Subgraph 和 Sepolia 集成（3–4 天）

**目标**：把本地验证过的主链路部署到 Sepolia，并建立可重建的查询索引。

**任务**

1. 准备 Sepolia RPC 和测试 ETH，使用专用测试钱包部署合约。
2. 记录 chainId、合约地址、部署区块、交易 hash 和合约版本。
3. 替换 Subgraph ABI、零地址和 `startBlock`，运行 codegen/build 后部署。
4. 前端列表改为 GraphQL 查询，交易刚确认时仍以 receipt 给出即时反馈。
5. 区分 RPC 错误、交易错误和索引延迟。

**验收门禁**

- Subgraph 重建后能从链上事件恢复相同课程、购买和证书数据。
- Sepolia 上完成一次端到端购买，并可在区块浏览器查看。

### P6：学习进度与 Oracle evidence（3–4 天）

**目标**：只由服务端依据课时规则判断完成度，生成稳定可审计的 evidence。

**任务**

1. 实现课时进度写入和课程进度汇总接口。
2. 服务端将 `watchedSeconds` 限制在课时时长内，未购买用户不得写入。
3. 定义 evidence 的规范化 JSON 结构、字段顺序和哈希算法。
4. 达到 100% 时写入唯一 `OracleEvidence`。
5. 完成 `/oracle/completion` 的 API key、nonce、过期时间、限速和审计日志。

**验收门禁**

- 客户端无法通过提交 `completed=true` 冒充完成。
- 相同 evidence 得到相同 hash，内容变化时 hash 必须变化。

### P7：Chainlink CRE 和证书闭环（4–5 天）

**目标**：通过 Chainlink CRE 查询已验证 evidence，经 KeystoneForwarder 写回并铸造不可转让证书。

**任务**

1. 先用受权本地账户手动履约，验证 Oracle -> Certificate 合约路径。
2. 实现 CRE `IReceiver.onReport`，保存 request ID 与学生请求的对应关系并校验 Forwarder/workflow 身份。
3. 编写 CRE TypeScript 工作流，从 Secrets 读取 API key，请求只读完成度 API并聚合稳定结果。
4. Consumer 验证 request ID 和请求状态，防止不存在、延迟和重复报告。
5. 前端增加请求中、等待 Oracle、已完成、失败可重试状态。
6. 为证书生成元数据，并在个人中心展示。

**验收门禁**

- 未购买、不存在 request ID、重复回调、API 未完成和重复证书均安全失败。
- `ownerOf` 和 `certificateOf` 结果正确，`transferFrom` 和 `safeTransferFrom` 都失败。

### P8：DEX 扩展（可选，3–5 天）

**目标**：在不影响课程核心链路的前提下，让学生用测试资产兑换 YD。

**任务**

1. 部署 MockUSDC，建立 WETH/YD 和 MockUSDC/YD 测试池。
2. 先实现只读报价，再实现 approve 和 swap。
3. UI 明确展示滑点、最少收到数量、deadline 和代币精度。

**验收门禁**

- 默认不使用无限 allowance，不将池子现货价格当作 Oracle 价格。
- 用测试资产完成兑换，失败时用户资产不受影响。

### P9：系统验收和交付（3–4 天）

**目标**：形成可重复部署、可自动验收和可演示的发布候选版。

**任务**

1. 运行 TypeScript、API、Subgraph、Solidity 和生产构建检查。
2. 增加 Playwright 主路径 E2E：连接测试钱包、授权、购买、访问课时、写入进度、申请证书。
3. 执行安全检查：角色最小权限、chain/address 匹配、nonce 重放、URL 过期、日志脱敏和 Oracle 限速。
4. 编写部署手册、回滚方案、测试账户/演示数据说明和 5–8 分钟答辩脚本。

**验收门禁**

- `pnpm check`、`forge fmt --check` 和 `forge test -vvv` 全部通过。
- E2E 主路径和关键失败路径通过。
- 新环境按文档能独立完成部署。

## 5. 里程碑与建议排期

| 里程碑 | 包含阶段 | 建议工期 | 结果 |
|---|---|---:|---|
| M1 本地链购买闭环 | P0–P2 | 5–7 天 | 本地钱包可完成 YD 购买 |
| M2 受保护内容与身份 | P3–P4 | 6–8 天 | 购买后可访问内容，资料签名防重放 |
| M3 测试网可查询版本 | P5 | 3–4 天 | Sepolia + Subgraph 完整购买演示 |
| M4 结业证书闭环 | P6–P7 | 7–9 天 | 进度 evidence 驱动不可转让证书 |
| M5 发布候选版 | P8–P9 | 3–9 天 | 可选 DEX、E2E、部署与答辩资料 |

不含 P8 的核心版本预估为 **24–32 个开发日**；排期不包含外部账号审核、faucet 等待和第三方服务故障。

## 6. 优先级

### Must Have

- 本地和 Sepolia 课程提交/审批/YD 购买。
- 真实钱包状态、网络校验、交易模拟和 receipt 反馈。
- 受链上购买资格保护的视频 API。
- Privy token + EIP-712 + 一次性 nonce。
- 学习进度、evidence 和不可转让证书。
- 关键合约/API/E2E 测试与部署文档。

### Should Have

- The Graph 课程、购买和证书查询。
- 教师内容管理界面、评论和学习进度可视化。
- 链上 receipt 与 Subgraph 索引延迟的明确 UI 区分。

### Could Have

- DEX 兑换和流动性演示。
- 更完善的证书分享卡和管理分析。

## 7. 质量与测试策略

| 层级 | 工具 | 最低覆盖 |
|---|---|---|
| Solidity | Foundry | 角色、状态转换、付款、暂停、重入边界、Oracle 回调、证书唯一与不可转让 |
| API | Vitest + Fastify inject | 输入校验、身份、链上资格、DB 事务、nonce 重放和 Oracle 鉴权 |
| Web | 组件测试 | 钱包、网络、授权/购买状态机、用户拒签和索引延迟 |
| Subgraph | Matchstick 或 mapping 测试 | event ID、课程状态、购买和证书实体 |
| E2E | Playwright | 学生购买、学习、进度和证书主路径 |

每次合并的最低门禁：

```bash
pnpm check
cd packages/contracts
forge fmt --check
forge test -vvv
```

## 8. 安全要求

- 全程只使用本地链和测试网资产。
- 合约地址与 chainId 绑定，切链后必须重新解析地址。
- 默认授权购买所需准确金额，不默认无限 allowance。
- 视频 URL 短时效，且每次由 API 重新校验购买资格。
- nonce 随机、一次性、有过期时间，必须与钱包、用户、domain 和 chainId 一起校验。
- Oracle API 有 API key、请求 nonce、过期时间、限速和审计日志。
- 生产前复查角色授权，部署者不长期保留无关高权限。

## 9. 主要风险与应对

| 风险 | 影响 | 应对措施 |
|---|---|---|
| 同时调试钱包、RPC、合约、API 和 Subgraph | 定位困难 | 严格按 P0→P9 推进，每层独立验收 |
| Sepolia RPC/faucet 不稳定 | 阻塞联调 | 主开发在 Anvil，至少配置两个 RPC 备选 |
| Subgraph 延迟 | UI 误报购买失败 | 交易以 receipt 为准，索引只用于后续查询 |
| 身份与钱包混淆 | 越权访问 | Privy token、绑定钱包和 EIP-712 签名三方一致校验 |
| 客户端伪造学习进度 | 错误铸造证书 | 服务端限幅、购买校验、规范化 evidence 和审计记录 |
| Chainlink 异步失败或重复回调 | 请求卡住或重复铸造 | request ID 唯一、幂等回调和有限重试状态机 |
| 需求扩张到 DEX | 核心版本延误 | DEX 保持可选，只在 M4 通过后开始 |

## 10. 接下来的立即任务

下一个开发迭代只做 P0，建议顺序如下：

1. 安装 Foundry 并运行现有合约测试。
2. 修复 Foundry 编译/测试差异，将 `forge test -vvv` 变为稳定门禁。
3. 启动 Anvil，执行本地部署脚本并导出地址。
4. 用 `cast` 跑通一次完整购买和证书流程。
5. P0 验收通过后，再进入 Provider 和前端读链开发。

## 11. 建议提交节奏

```text
test(contracts): pass foundry contract matrix
chore(contracts): document reproducible local deployment
feat(web3): configure providers chains addresses and generated abis
feat(web): read wallet balance and on-chain course state
feat(web): complete yd approval and course purchase
feat(api): persist course content and protect lesson access
feat(auth): verify privy identity and eip712 profile update
feat(subgraph): index sepolia courses purchases and certificates
feat(progress): persist learning progress and completion evidence
feat(oracle): mint certificates from verified completion
test(e2e): cover the student purchase and certificate journey
docs: add deployment operations and demo guide
```
