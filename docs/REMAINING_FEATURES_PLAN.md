# Web3 University 剩余功能开发计划书

> 版本：v1.1  
> 日期：2026-08-15  
> 范围：教师中心、评论与混合课程列表、学习进度/证书、Chainlink CRE、Uniswap 兑换和 Subgraph 部署

## 1. 目标与完成标准

本计划从当前 P0–P4 基线出发，把已有合约、Fastify/Prisma API、Next.js、Privy 和 Subgraph 骨架收口为可在 Sepolia 重复演示的完整 DApp。

最终验收以真实数据和交易为准，不以静态文案或编译成功代替：

1. 教师在页面填写链下资料，提交 `submitCourse`；Reviewer 在页面 approve/reject/offline。
2. 首页合并 Subgraph 链上状态与 PostgreSQL 详情，课程 ID 全程一致；评论可发布和查询。
3. 已购买用户可写入学习进度，100% 生成唯一 evidence，发起证书请求并最终看到 NFT。
4. Sepolia 上的 Chainlink CRE 工作流真实请求 API，并经 KeystoneForwarder 写回铸造证书。
5. 用户可将测试 WETH 或 MockUSDC 兑换为 YD，再用 YD 购买课程。
6. Subgraph 能从部署区块重建 Course/Purchase/Certificate，页面展示真实购买记录。

## 2. 当前基线与缺口

### 可复用基线

- `CourseMarket` 已有 TEACHER/REVIEWER/PAUSER 角色、课程状态机和 YD 购买。
- `YDToken` 已有 ERC20/ERC20Permit 和固定供应量。
- `CourseCertificate` 已有唯一、不可转让 ERC721 及 `tokenURI`。
- `CompletionOracle` 已有请求、幂等履约和铸造调用骨架。
- PostgreSQL 已有 CourseDetail/Lesson/Comment/LearningProgress/OracleEvidence 模型。
- API 已有 Privy 身份验证、课程内容查询和链上购买校验。
- 购买页已有 `approve -> buy -> receipt`。
- Subgraph 已能编译 Course/Purchase/Certificate mapping。

### 主要缺口

- 教师中心、首页课程、证书和学习统计仍有静态演示数据。
- 缺少评论 API/UI、进度 API/UI 和 evidence 生成规则。
- CRE Consumer 与工作流代码已完成，尚待公网 API、CRE 账户/部署权限和 Sepolia 端到端验收。
- 缺少 MockUSDC、DEX 流动性脚本、报价和 swap UI。
- Subgraph 的 Sepolia 合约地址仍为零，前端未建立 GraphQL 数据层。

## 3. 总体技术路线

```text
阶段 A：教师上架/审核
  ↓ 稳定 Course ID 和事件
阶段 B：评论 + 链上/链下混合课程数据
  ↓ 稳定内容与用户关系
阶段 C：学习进度 + Evidence + 本地证书闭环
  ↓ 冻结合约/API 接口
阶段 D：Sepolia 统一部署
  ├─阶段 E：Chainlink CRE
  ├─阶段 F：Uniswap 测试池和兑换
  └─阶段 G：Subgraph 部署与前端替换
       ↓
阶段 H：E2E、安全验收与演示交付
```

原则：先在 Anvil 上完成所有可本地验证的业务，再一次性部署 Sepolia。Chainlink、Uniswap 和 Subgraph 都依赖最终合约地址，不应提前反复部署。

## 4. 阶段计划

### 阶段 A：教师中心真实上架与审核（3–4 天）

**状态（2026-08-13）**：代码已完成；本地验收只需应用数据库迁移，并为实际 Privy 钱包授予教师/审核角色。操作见 [`TEACHER_CENTER.md`](./TEACHER_CENTER.md)。

**目标**：将 `/admin` 从静态样式页变为真实链上操作台。

**任务**

1. 建立教师和 Reviewer 钱包角色检测，读取 `hasRole` 并隐藏无权操作。
2. 新增课程表单：标题、描述、封面、课时、价格、教师简介。
3. 先保存链下草稿，生成内容哈希/元数据 URI，再调用 `submitCourse(metadataURI, priceYD)`。
4. 从 receipt 解析 `CourseSubmitted.courseId`，使用该 ID 原子关联 CourseDetail/Lesson；失败时保留可重试草稿。
5. Reviewer 列表展示 Pending/Active/Rejected/Offline，接入 approve/reject/offline 交易及 receipt 状态。
6. API 写接口从开发 key 升级为 Privy token + 钱包角色校验；保留 dev key 仅用于 seed。

**代码交付**

- 课程 Draft 状态/迁移和必要的 Prisma migration。
- 教师/Reviewer API、合约 hooks、课程表单、真实列表和交易状态组件。
- 角色配置脚本，不把管理员私钥放入前端。

**验收门禁**

- 无 TEACHER_ROLE 不能提交；非 Reviewer 不能审核。
- 拒绝交易、RPC 中断、receipt revert 不会产生假的已上架状态。
- 页面提交一门 4 YD 课程，审核后合约 `courses(id).status == Active`，数据库可通过同一 ID 查询。

### 阶段 B：评论 API 与混合课程列表（3–4 天）

**状态（2026-08-13）**：代码已完成，等待本地业务验收。首页/详情已移除 `demoCourses`，混合课程 API 优先使用 Subgraph、未配置时自动降级到 RPC；评论已支持 Privy 发布、分页、限频和 Reviewer 软隐藏。

**目标**：链上管身份/价格/状态/购买，数据库管详情/课时/视频/评论，前端显式合并两个数据源。

**任务**

1. API 增加分页课程批量查询，支持按 `courseId[]` 返回详情，解决 N+1。
2. 建立 `GET /courses` 混合服务：Subgraph 为主索引，RPC 作关键事实校验，DB 按 courseId 补齐详情。
3. 增加 `GET /courses/:id/comments` 和 `POST /courses/:id/comments`，发布必须 Privy 登录，并记录用户/钱包。
4. 实现评论长度、空白、分页、限频、软隐藏和 XSS 输出编码。
5. 首页和课程详情移除 `demoCourses`，增加 loading/empty/partial/error/indexing-lag 状态。
6. 保留降级路径：Subgraph 暂不可用时，可按已知 ID 用 RPC + DB 显示，但明确标识降级。

**验收门禁**

- 链上没有的 ID 不能伪造为课程；链上 Offline 不能购买。
- Lesson 列表不暴露 `videoKey`，视频 URL 仍要求 Privy + 链上购买。
- 两个登录用户能看到同一课程的分页评论，未登录发布返回 401。

### 阶段 C：学习进度、Evidence 与本地证书闭环（4–5 天）

**状态（2026-08-14）**：已完成并通过本地业务验收。实际 Privy 绑定钱包已跑通购买、5 分钟学习、唯一 Evidence、本地 Oracle 履约和 W3CERT 铸造；`certificateOf`、`ownerOf` 与 `tokenURI` 已核验。操作见 [`STAGE_C_PROGRESS_CERTIFICATE.md`](./STAGE_C_PROGRESS_CERTIFICATE.md)。

**目标**：先不依赖 Chainlink，完整证明“已购买 -> 学习 -> evidence -> Oracle -> NFT”。

**任务**

1. 实现进度 API：读取课程进度、更新课时观看时长、标记完成；身份来自 Privy token。
2. 每次写入前调用 `hasPurchased`，不接受客户端传入的“已购买”声明。
3. 限制单次时长跃增和总时长，用服务端时间窗口防止瞬间刷到 100%。
4. 完成度达 100% 后，在事务中 upsert 唯一 `OracleEvidence(wallet, courseId)`，哈希覆盖用户、课程、课时和最终进度。
5. 收紧 `/oracle/completion`：API key/nonce/expiresAt/限频/审计日志，仅返回最小必要证据。
6. 新增证书 metadata endpoint 或 IPFS JSON 生成，包含课程名、图片、学生地址、课程 ID 和 evidence hash。
7. 本地使用 ORACLE_ROLE 履约，个人中心增加申请中/验证中/已铸造/失败状态。

**验收门禁**

- 未购买、伪造钱包、重复 evidence、重复 fulfill 全部失败。
- 达到 100% 后能铸造唯一 W3CERT，`ownerOf`、`certificateOf`、`tokenURI` 正确，转让 revert。
- 个人中心不再使用静态学习进度和静态证书。

### 阶段 D：Sepolia 部署冻结（1–2 天 + 外部等待）

**状态（2026-08-15）**：已完成。Sepolia 四合约部署、角色授权、4 YD 演示课程、Student YD 补足和 MetaMask `approve + buy` 均已完成；`hasPurchased(student, 1)=true`，购买交易 receipt 成功，deployment manifest、API/Web 配置、链上检查和全部代码门禁通过。验收证据见 [`STAGE_D_SEPOLIA_DEPLOYMENT.md`](./STAGE_D_SEPOLIA_DEPLOYMENT.md)。下一阶段为阶段 E（Chainlink CRE）。

**目标**：为 Chainlink、DEX 和 Subgraph 生成同一套可追溯合约地址。

**任务**

1. 准备专用 Sepolia 部署钱包、RPC、测试 ETH/LINK；不使用主钱包。
2. 编写幂等 Sepolia 部署/角色配置/seed 脚本，输出 JSON deployment manifest。
3. 记录 chainId、地址、部署区块、tx hash、git commit、ABI 哈希和角色授予交易。
4. 同步 `.env.example`、Shared addresses、API 和 Web 配置；启动时拒绝 chain/address 不匹配。

**验收门禁**

- 用 `cast code` 验证所有地址有 bytecode，读取的 YD/Market/Oracle/Certificate 相互依赖正确。
- Sepolia 完成一次 4 YD `approve + buy`，记录 receipt 和 `CoursePurchased`。

### 阶段 E：Chainlink CRE 真实接入（4–5 天 + 部署权限等待）

**状态（2026-08-16）**：CRE 主路径代码已完成，Deploy Access 仍在等待审批。审批期间的 AWS EIP-712 签名 Oracle fallback 已完成部署并通过 Sepolia 端到端验收：两节课进度完成、`requestCompletion`、AWS 签名、`fulfillWithSignature` 和 NFT 证书展示全部通过。CRE 获批后再补 DON report 交易证据。

**目标**：用 Chainlink CRE DON 监听完课事件，访问受保护 API，经 KeystoneForwarder 幂等写回证书合约。

**任务**

1. Oracle 实现 CRE `IReceiver.onReport`，校验 KeystoneForwarder、workflow owner/name/ID 和 ERC-165。
2. `CompletionRequested` 作为 EVM Log Trigger，记录 Pending/Fulfilled/Failed/TimedOut，忽略未知或重复报告。
3. CRE TypeScript 工作流用 Secret 中的 API key 调用 challenge/completion API，一次性 nonce 不上链。
4. DON 对 `completed/evidenceHash/tokenURI` 做一致性聚合，签名报告由 KeystoneForwarder 写入 Oracle。
5. 加入请求超时、可控重试和前端轮询，证书合约仍保证每学生/课程唯一。
6. 单元测试用 Mock KeystoneForwarder；Sepolia 做 request/report/CertificateIssued 端到端验收。
7. 保留 CRE 主路径，同时提供短时 EIP-712 AWS 签名 fallback；两条路径必须竞争同一个 Pending request，不能重复铸造。

**验收门禁**

- Sepolia 可查 request tx、KeystoneForwarder report tx 和 CertificateIssued tx。
- API 无证据、返回 false、超时、错误响应、重复回调都不会错误铸造。
- 资料库中没有 API key、CRE Secret 或部署私钥。

### 阶段 F：Uniswap 测试池与兑换页（4–6 天）

**状态（2026-08-16）**：已完成并通过 Sepolia 业务验收。MockUSDC faucet、mUSDC -> YD、ETH -> WETH -> YD、余额变化、滑点保护、两个 0.3% Pool 和 full-range Position 均已验证；同一学生地址在阶段 D 已完成 4 YD 课程购买，且重复购买保护正常。操作与链上地址见 [`STAGE_F_UNISWAP_V3.md`](./STAGE_F_UNISWAP_V3.md)。

**目标**：把测试 WETH/MockUSDC 兑换为 YD，并与课程购买连成一条演示路径。

**固定范围**

- 使用 Uniswap V3 测试路径；原生 ETH 先 wrap 为 WETH，链上池使用 ERC20/ERC20 交易对。
- USDC 使用自有 MockUSDC（6 decimals），明确标识“测试资产”，不伪装官方 USDC。

**任务**

1. 新增 MockUSDC 和 faucet（仅测试网），确认 6/18 decimals 换算。
2. 基于官方 Sepolia Factory/PositionManager/SwapRouter/Quoter 地址创建 WETH/YD 和 MockUSDC/YD 池并注入教学流动性。
3. 部署脚本记录 fee tier、tick range、初始价格、position tokenId 和 tx hash。
4. 新增 `/swap` UI：资产/数量选择、余额、Quoter 报价、price impact、最小到账、deadline、approve 和 exact-input swap。
5. 使用交易前 simulation；默认有限 allowance；用户设置滑点边界，不用 `amountOutMinimum=0`。
6. swap receipt 成功后刷新 YD 余额，提供“去购买 4 YD 课程”入口。

**验收门禁**

- MockUSDC -> YD 和 WETH -> YD 各完成一笔，用户 YD 余额增加，池余额/价格变化可查。
- 超滑点、过期 deadline、余额不足、授权不足安全失败。
- 池子价格只用于兑换报价，不作为安全 Oracle 价格。

### 阶段 G：Subgraph 部署、真实课程和购买记录（3–4 天 + 索引等待）

**状态（2026-08-16）**：已完成并通过端到端验收。Subgraph `0.1.0` 已在 Studio 部署并追平 Sepolia 链头，课程 1、购买和 tokenId 1 证书均已索引；公网 API 返回 `source=subgraph`、`degraded=false`、`lagBlocks=0`、`hasIndexingErrors=false`。AWS ECS revision 11 和 Cloudflare Worker 新版本已稳定发布。操作与验收证据见 [`STAGE_G_SUBGRAPH.md`](./STAGE_G_SUBGRAPH.md)。

**目标**：用 The Graph 索引代替前端静态课程/购买/证书列表。

**任务**

1. 从最终合约 artifact 自动同步 ABI，不手工维护两份不同 ABI。
2. 填写 Sepolia CourseMarket/Certificate 地址和各自 deployment startBlock，用 `networks.json` 区分 local/sepolia。
3. 完善 schema：Course、Purchase、Certificate 关联、buyer/student 索引和交易哈希；补 mapping 测试。
4. `graph codegen && graph build`，在 Subgraph Studio 创建 slug，`graph auth`后部署 semver 版本。
5. 等待 sync 到 chain head，用已知 receipt 对照课程/购买/证书数据。
6. 建立前端 GraphQL client/query：首页 Active 课程、用户购买记录、用户证书；按 courseId 批量合并 DB 详情。
7. receipt 为交易成功的即时事实，Subgraph 后续同步；UI 明确显示“等待索引”，不把索引延迟当失败。

**验收门禁**

- Studio 查询返回与链上事件一致的 Course/Purchase/Certificate。
- 首页不再 import `demoCourses`，个人中心不再显示静态购买记录/证书。
- 重新部署相同 Subgraph 从 startBlock 同步后，数据结果一致。

### 阶段 H：系统验收和交付（3–4 天）

**状态（2026-08-17）**：已完成系统验收与发布收口。API 42/42、Foundry 26/26、Playwright 12/12 通过；Secret 扫描 0 发现，Sepolia live acceptance、Subgraph、Next/Cloudflare build 均通过。E2E 发现并修复移动端菜单，Cloudflare 版本 `bc3369f2-6de3-4474-93bf-fde4b350f0a0` 已发布并通过线上回归。CRE DON 主路径仍等待 Deploy Access，当前发布明确使用已通过端到端验收的 AWS EIP-712 fallback。操作与交付证据见 [`STAGE_H_RELEASE_ACCEPTANCE.md`](./STAGE_H_RELEASE_ACCEPTANCE.md)。

**任务**

1. 运行 TypeScript、Vitest、Foundry、Subgraph codegen/build 和 Next.js production build。
2. Playwright E2E 覆盖：教师提交 -> Reviewer 审核 -> 兑换 YD -> approve/buy -> 看课/评论 -> 100% -> Chainlink -> NFT。
3. 失败路径：错网络/地址、钱包拒绝、RPC 错误、Subgraph 延迟、重放、无购买看视频、Oracle 超时、DEX 滑点。
4. 产出部署手册、环境变量清单、回滚方案、测试账户/演示数据和 8 分钟答辩脚本。

**最终门禁**

- 全部自动化检查通过，且 Sepolia 主路径完整跑通一次。
- 演示中每个“完成”状态都可对应 DB 记录、交易 receipt 或 Subgraph 实体。

## 5. 依赖与建议排期

| 阶段 | 依赖 | 预估 | 可否纯代码完成 |
|---|---|---:|---|
| A 教师上架/审核 | 当前合约/API | 3–4 天 | 是 |
| B 评论/混合列表 | A，Subgraph 查询接口可先 mock | 3–4 天 | 是 |
| C 进度/本地证书 | B | 4–5 天 | 是 |
| D Sepolia 部署 | A–C、RPC/测试 ETH | 1–2 天 | 否 |
| E Chainlink CRE | C/D、公网 HTTPS API、CRE 账户/部署权限/Secrets | 4–5 天 | 部分 |
| F Uniswap | D、池子流动性 | 4–6 天 | 部分 |
| G Subgraph | D、Studio 账号/deploy key | 3–4 天 | 部分 |
| H E2E/交付 | A–G | 3–4 天 | 是（Sepolia 验收需外部服务） |

**总计**：25–34 个开发日，不含 faucet、DON 回调、Subgraph 同步和第三方服务故障的等待时间。

建议以两周演示版为目标时先做 A -> B -> C -> D -> G，得到“真实课程 + 购买 + 进度 + 本地 Oracle + 索引”主线；再做 E/F。如果作业明确必须当场演示 Chainlink 和 Uniswap，则按完整顺序执行。

## 6. 需要用户后续提供的外部配置

代码开发可先行，但 D/E/F/G 真实验收前需要：

- Sepolia RPC URL、专用部署钱包和少量测试 ETH。
- CRE Organization、workflow owner 钱包、部署权限、Sepolia KeystoneForwarder 地址和 CRE Secrets。
- The Graph Studio slug、deploy key 和受限制查询 API key。
- 证书图片/metadata 的 IPFS 或其他公开可访问存储。

所有私钥和服务 secret 只放本地/部署平台密钥管理，不提交 Git。

## 7. 工程约束与风险

1. **身份与交易账户分离**：Privy DID 用于身份，链上事实必须用该 DID 绑定的钱包再校验。
2. **事实优先级**：receipt/RPC 是即时事实，Subgraph 是最终索引，DB 不能决定购买或证书所有权。
3. **跨系统不做假原子事务**：课程草稿/链上提交使用状态机和可重试对账，不宣称 DB + EVM 是单一事务。
4. **Oracle 不会让源数据天然可信**：进度防刷、evidence 唯一、API 限频和审计必须先完成。
5. **DEX 池只用测试资产**：不使用真实资金，不将教学池现货价格用于其他安全决策。
6. **第三方地址不硬猜**：Chainlink 和 Uniswap 的 Sepolia 地址在实施日从官方文档复核并写入 deployment manifest。

## 8. Definition of Done

一项功能只有同时满足以下条件才标记完成：

- 业务代码、错误/等待/空状态和安全边界已实现。
- 单元/集成测试和至少一条关键失败路径通过。
- `pnpm check`、`forge fmt --check`、`forge test -vvv` 和 Subgraph build 通过。
- 涉及外部服务时，有 Sepolia/Studio/DON 的可追溯 tx/request/deployment 证据。
- 文档、`.env.example`、部署 manifest 和演示步骤已同步，新环境能按文档重现。
