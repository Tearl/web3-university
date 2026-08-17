# 阶段 G：Subgraph 部署与前端真实索引

> 网络：Sepolia（chainId `11155111`）  
> 状态：已完成并通过 Sepolia、AWS ECS 和 Cloudflare 端到端验收（2026-08-16）

Studio 页面：`https://thegraph.com/studio/subgraph/web-3-university-sepolia`

开发查询地址：`https://api.studio.thegraph.com/query/1757853/web-3-university-sepolia/0.1.0`

## 1. 已完成的代码

- CourseMarket 和 CourseCertificate ABI 从共享 artifact 自动同步，不再手工维护两份。
- Sepolia 地址与 startBlock 从 `deployments/sepolia.json` 自动写入 manifest 和 `networks.json`。
- 索引 Course、Purchase、Certificate 关系、钱包、交易哈希、区块号和日志序号。
- 首页 Active 课程优先使用 Subgraph，失败时回退 RPC。
- 个人中心查询钱包购买与证书，展示索引区块和链头差距。
- Subgraph 不可用时直接读取 `hasPurchased`、`certificateOf` 和 `tokenURI` 当前事实，不进行大范围 `eth_getLogs`。
- 已增加 Matchstick mapping 测试文件；当前网络无法下载 GitHub 测试二进制，`graph codegen && graph build` 已通过。

## 2. 固定数据源

| 数据源 | 地址 | startBlock |
|---|---|---:|
| CourseMarket | `0x50dff16440510f905f2735c2e9290056878922dd` | `11491622` |
| CourseCertificate | `0xfadbd9f71428165829f27cccf624b1bab3cbaa26` | `11491622` |

同步与构建：

```bash
pnpm subgraph:build
```

## 3. 创建 Subgraph Studio 项目

1. 打开 `https://thegraph.com/studio/`。
2. 连接钱包登录。
3. 点击 **Create a Subgraph**。
4. Name 建议填写 `Web3 University Sepolia`。
5. 当前 Studio Slug 为 `web-3-university-sepolia`。
6. Network 选择 **Ethereum Sepolia**。

Studio 部署只是把版本推到私有开发区，不等于发布到去中心化网络，不需要本阶段支付 GRT 发布费用。

## 4. CLI 授权和部署

在 Subgraph 详情页复制 Deploy Key，只在终端执行：

```bash
pnpm --filter @web3-university/subgraph exec graph auth "你的 Deploy Key"
```

不要把 Deploy Key 写入 `.env`、聊天或 Git。

本机 `.env` 只写公开 slug：

```dotenv
SUBGRAPH_SLUG=web-3-university-sepolia
```

部署第一个语义版本：

```bash
pnpm subgraph:deploy 0.1.0
```

## 5. Studio 验收查询

等待状态变成 Healthy，并接近链头，然后在 Playground 执行：

```graphql
query StageGAcceptance($wallet: Bytes!) {
  courses(orderBy: courseId) {
    courseId
    teacher
    priceYD
    status
  }
  purchases(where: { buyer: $wallet }) {
    course { courseId }
    buyer
    priceYD
    transactionHash
  }
  certificates(where: { student: $wallet }) {
    tokenId
    course { courseId }
    student
    tokenURI
    transactionHash
  }
  _meta {
    block { number }
    hasIndexingErrors
  }
}
```

Variables：

```json
{
  "wallet": "学生钱包地址（小写）"
}
```

预期至少返回课程 1、一笔购买和 tokenId 1 的证书。

## 6. AWS 配置

当前 Subgraph 保持 Studio 私有开发部署，未发布到去中心化网络，因此 AWS 使用 Studio Development Query URL，不需要 The Graph API Key。该开发地址每天 3,000 次查询，适合当前测试演示。

1. 在 AWS Secrets Manager 新建：

```text
/w3u/staging/subgraph-url
```

2. ECS Task Definition 的 `Main` 容器增加 Secret：

```text
SUBGRAPH_URL -> /w3u/staging/subgraph-url 的 ARN
```

3. 增加普通环境变量：

```text
COURSE_MARKET_START_BLOCK=11491622
COURSE_CERTIFICATE_START_BLOCK=11491622
```

4. API 镜像 `stage-g-subgraph-v1` 已发布，ECS Task Definition `default-web3-university-api:11` 已稳定运行。

5. `/health` 已验证 `features.subgraph=true`。

## 7. 前端验收

- 首页不再提示 RPC 降级。
- 个人中心显示 1 笔真实购买记录、交易哈希和 1 枚证书。
- 索引未追上时显示“交易已确认，Subgraph 仍在索引”，而不是交易失败。
- `_meta.block.number` 接近 Sepolia 链头，`hasIndexingErrors=false`。

## 8. 最终验收结果

- Subgraph `0.1.0` 状态 Healthy，已索引课程 1、一笔购买和 tokenId 1 证书。
- 公网 `/courses` 返回 `source=subgraph`、`degraded=false`。
- 验收时 `indexedBlock=11501447`、`chainHeadBlock=11501447`、`lagBlocks=0`、`caughtUp=true`。
- `hasIndexingErrors=false`。
- Cloudflare Worker 已发布版本 `70da35be-2d84-42ef-9f03-8f22b357c02b`。
- 线上首页已读取真实课程 1，页脚网络为 `Sepolia 测试链 · 11155111`。
- 个人中心的购买和证书按当前 Privy 身份绑定的钱包查询；若显示“尚未绑定 EVM 钱包”，需先在 Privy 中绑定完成阶段 D–F 验收的钱包。

完整门禁：

```bash
pnpm subgraph:build
pnpm check
pnpm cloudflare:build
```
