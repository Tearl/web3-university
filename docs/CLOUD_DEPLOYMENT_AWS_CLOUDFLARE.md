# Cloudflare Workers 前端 + AWS ECS/RDS 后端部署手册

> 目标链：Sepolia（`11155111`）  
> 前端：Cloudflare Workers + OpenNext  
> API：Amazon ECS Express Mode + ECR  
> 数据库：Amazon RDS for PostgreSQL  
> 适用日期：2026-08-15

## 1. 最终结构

```text
浏览器
  └─ https://web3-university-web.<你的子域>.workers.dev
       └─ https://<服务名>.ecs.<区域>.on.aws
            ├─ RDS PostgreSQL（VPC 私网 5432）
            ├─ Sepolia RPC
            ├─ Privy
            └─ Subgraph

Chainlink CRE DON
  └─ https://<服务名>.ecs.<区域>.on.aws/oracle/*
```

AWS 已停止向新客户开放 App Runner。本项目使用其官方替代方案 ECS Express Mode；Express Mode 会创建 Fargate 服务、HTTPS Application Load Balancer、自动扩缩容和 CloudWatch 日志。

## 2. 本地准备

需要安装并登录：

- Docker Desktop
- AWS CLI v2：`aws configure`
- Cloudflare Wrangler：项目已经安装，无需全局安装

先确认代码门禁：

```bash
pnpm check
pnpm cloudflare:build
pnpm docker:api:build
```

`Dockerfile.api` 固定生成 `linux/amd64` 镜像，并默认从 AWS Public ECR 拉取官方 Node 基础镜像，避免 Docker Hub token/限速问题。容器启动时会先执行 `prisma migrate deploy`，成功后监听 `0.0.0.0:4000`。

## 3. AWS：选择区域并创建安全组

以下示例使用新加坡 `ap-southeast-1`；也可以选择你账户中更合适且支持 ECS Express Mode 的区域。后续 ECR、RDS、ECS 和 Secrets Manager 必须使用同一区域。

打开 **VPC → Security groups**，在默认 VPC 创建：

1. `w3u-api-sg`
   - 入站：暂不添加。
   - 出站：保留允许全部。API 需要访问 Privy、Sepolia RPC 和其他公网 HTTPS 服务。
2. `w3u-rds-sg`
   - 入站：PostgreSQL / TCP / `5432`，来源选择 `w3u-api-sg`。
   - 不允许 `0.0.0.0/0`。

这样只有带 `w3u-api-sg` 的 ECS Task 可以访问数据库。

## 4. AWS：创建 RDS PostgreSQL

进入 **RDS → Databases → Create database**：

1. Creation method：`Standard create`。
2. Engine：`PostgreSQL`。
3. Template：测试阶段选择 `Free tier` 或 `Dev/Test`。
4. DB instance identifier：`web3-university-db`。
5. Master username：自定义，例如 `w3u_admin`。
6. 密码：让 AWS 管理或生成高强度密码，不要发送给任何人。
7. Instance：选择当前区域可用的小规格，例如 `db.t4g.micro`。
8. Storage：测试阶段 20 GiB，并开启 storage autoscaling。
9. Connectivity：
   - VPC：与安全组相同的默认 VPC。
   - Public access：`No`。
   - Security group：选择 `w3u-rds-sg`。
10. Initial database name：`web3_university`。
11. Backup retention：测试阶段至少 1 天。

等待状态变为 `Available`，复制 RDS Endpoint。数据库连接串格式如下，只保存到 Secrets Manager：

```text
postgresql://w3u_admin:<URL编码后的密码>@<RDS_ENDPOINT>:5432/web3_university?schema=public&sslmode=require
```

如果密码包含 `@`、`:`、`/`、`#` 等字符，必须先做 URL 编码。

## 5. AWS：创建 ECR 并推送 API 镜像

进入 **Elastic Container Registry → Private repositories → Create repository**：

- Repository name：`web3-university-api`
- Tag immutability：建议开启
- Scan on push：开启

也可以使用 CLI。不要把下列占位符原样执行：

```bash
export W3U_AWS_REGION=ap-southeast-1
export W3U_AWS_ACCOUNT_ID=你的12位AWS账户ID
export W3U_ECR_REPOSITORY=web3-university-api

aws ecr get-login-password --region "$W3U_AWS_REGION" \
  | docker login --username AWS --password-stdin \
    "$W3U_AWS_ACCOUNT_ID.dkr.ecr.$W3U_AWS_REGION.amazonaws.com"

docker buildx build \
  --platform linux/amd64 \
  --file Dockerfile.api \
  --tag "$W3U_AWS_ACCOUNT_ID.dkr.ecr.$W3U_AWS_REGION.amazonaws.com/$W3U_ECR_REPOSITORY:stage-e" \
  --push \
  .
```

Mac 为 Apple Silicon 时必须保留 `--platform linux/amd64`，避免 ECS 启动时报镜像架构不匹配。

## 6. AWS：创建 Secrets Manager 密钥

进入 **Secrets Manager → Store a new secret → Other type of secret**。建议每项单独创建，名称使用 `/w3u/staging/...`：

| ECS 环境变量 | Secrets Manager 名称 | 内容 |
|---|---|---|
| `DATABASE_URL` | `/w3u/staging/database-url` | 第 4 节连接串 |
| `PRIVY_APP_SECRET` | `/w3u/staging/privy-app-secret` | Privy 后端 Secret |
| `PRIVY_VERIFICATION_KEY` | `/w3u/staging/privy-verification-key` | Privy 验证密钥 |
| `ORACLE_API_KEY` | `/w3u/staging/oracle-api-key` | 至少 32 位随机值 |
| `VIDEO_SIGNING_SECRET` | `/w3u/staging/video-signing-secret` | 至少 32 位随机值 |
| `DEV_TEACHER_KEY` | `/w3u/staging/dev-teacher-key` | 随机值；生产环境不要对外提供 |
| `FALLBACK_ORACLE_PRIVATE_KEY` | `/w3u/staging/fallback-oracle-private-key` | 专用 Sepolia fallback signer 私钥；不得复用部署钱包 |
| `SUBGRAPH_URL` | `/w3u/staging/subgraph-url` | Studio Development Query URL；私有 Studio 版本无需 API Key |

部署私钥、Teacher 私钥和 Treasury 私钥不属于 API 运行配置，不要放入 ECS。

## 7. AWS：创建 ECS Express Mode API

进入 **Amazon ECS → Express Mode → Create**。如果控制台尚未显示 Express Mode，使用 AWS 官方 CLI 创建流程。

基础配置：

- Service name：`web3-university-api`
- Container image：第 5 节 ECR 镜像 URI
- Container port：`4000`
- Health check path：`/health`
- CPU/Memory：测试阶段 `1 vCPU / 2 GB`
- Scaling：Min `1`，Max `2`
- Network：默认 VPC的至少两个 public subnets
- Additional security group：`w3u-api-sg`
- Public HTTPS endpoint：开启
- Logs/monitoring：开启

Express Mode 控制台可以自动创建所需 IAM Role。引用 Secrets Manager 时，Task Execution Role 必须具有读取上述 Secret ARN 的 `secretsmanager:GetSecretValue` 权限。

普通环境变量填写：

```dotenv
NODE_ENV=production
HOST=0.0.0.0
CHAIN_ID=11155111
NEXT_PUBLIC_CHAIN_ID=11155111

WEB_ORIGIN=https://placeholder.invalid
PUBLIC_API_URL=https://placeholder.invalid
CERTIFICATE_IMAGE_URL=https://placeholder.invalid/certificate-w3.svg
VIDEO_BASE_URL=https://placeholder.invalid/media

PRIVY_APP_ID=你的Privy App ID
NEXT_PUBLIC_PRIVY_APP_ID=同一个Privy App ID

RPC_URL=你的Sepolia RPC URL
NEXT_PUBLIC_RPC_URL=同一个Sepolia RPC URL

YD_TOKEN_ADDRESS=阶段D的YD地址
COURSE_MARKET_ADDRESS=阶段D的Market地址
COURSE_CERTIFICATE_ADDRESS=阶段D的Certificate地址
COMPLETION_ORACLE_ADDRESS=阶段E新CRE Oracle地址

NEXT_PUBLIC_YD_TOKEN_ADDRESS=与YD_TOKEN_ADDRESS相同
NEXT_PUBLIC_COURSE_MARKET_ADDRESS=与COURSE_MARKET_ADDRESS相同
NEXT_PUBLIC_CERTIFICATE_ADDRESS=与COURSE_CERTIFICATE_ADDRESS相同
NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS=与COMPLETION_ORACLE_ADDRESS相同

ORACLE_NONCE_TTL_SECONDS=120
ORACLE_RATE_LIMIT_PER_MINUTE=60
COMMENT_RATE_LIMIT_PER_MINUTE=5
PROGRESS_INITIAL_ALLOWANCE_SECONDS=30
PROGRESS_UPDATE_GRACE_SECONDS=10
PROGRESS_MAX_DELTA_SECONDS=60
VIDEO_URL_TTL_SECONDS=300
FALLBACK_ORACLE_SIGNER_ADDRESS=专用fallback钱包公开地址
FALLBACK_ATTESTATION_TTL_SECONDS=300
```

把第 6 节的八项通过 **Secrets** 引用，不要作为可见的 plain-text environment variables。

首次部署允许四个 URL 暂时使用 `placeholder.invalid`，因为 ECS 和 Cloudflare 的正式域名尚未生成。服务变为 Active 后复制：

```text
https://<服务名>.ecs.<区域>.on.aws
```

验证：

```bash
curl -i https://你的ECS地址/health
```

应返回 HTTP 200。若失败，依次检查 CloudWatch 日志、RDS 状态、安全组、`DATABASE_URL` 和 Prisma migration。

## 8. Cloudflare：填写前端构建变量

在根目录被 Git 忽略的 `.env` 中确认以下值。`NEXT_PUBLIC_*` 会进入浏览器构建产物，不要在其中放真正的私钥或后端 Secret：

```dotenv
NEXT_PUBLIC_API_URL=https://你的ECS地址
NEXT_PUBLIC_PRIVY_APP_ID=你的Privy App ID
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=你的Sepolia RPC URL

NEXT_PUBLIC_YD_TOKEN_ADDRESS=阶段D的YD地址
NEXT_PUBLIC_COURSE_MARKET_ADDRESS=阶段D的Market地址
NEXT_PUBLIC_CERTIFICATE_ADDRESS=阶段D的Certificate地址
NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS=阶段E新CRE Oracle地址
```

Alchemy Key 出现在 `NEXT_PUBLIC_RPC_URL` 时会被浏览器看到，因此必须在 Alchemy 后台限制允许域名、网络和调用范围。

## 9. Cloudflare：首次部署 Workers

从仓库根目录执行：

```bash
pnpm --filter @web3-university/web exec wrangler login
pnpm cloudflare:build
pnpm cloudflare:deploy
```

Wrangler 使用 [`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc)，Worker 名称为 `web3-university-web`。部署成功后记录：

```text
https://web3-university-web.<你的Cloudflare子域>.workers.dev
```

先逐页检查：

- `/`
- `/courses/1`
- `/profile`
- `/admin`

以后可用下面的命令在本机 Workers 运行时预览：

```bash
pnpm cloudflare:preview
```

如改为 Cloudflare Workers Builds 自动部署，必须把第 8 节全部 `NEXT_PUBLIC_*` 同时配置为 Build Variables；这些值需要在 Next.js 构建阶段存在。

## 10. 回填 AWS API 的真实 URL

返回 ECS Express Mode，更新环境变量：

```dotenv
WEB_ORIGIN=https://你的Cloudflare Workers地址
PUBLIC_API_URL=https://你的ECS地址
CERTIFICATE_IMAGE_URL=https://你的Cloudflare Workers地址/certificate-w3.svg
VIDEO_BASE_URL=https://你的ECS地址/media
```

触发新部署。API 当前只允许一个精确的 `WEB_ORIGIN`，所以这里必须填写用户实际打开的生产前端 Origin，末尾不要加 `/`。

再次验证 CORS：

```bash
curl -i \
  -H "Origin: https://你的Cloudflare Workers地址" \
  https://你的ECS地址/health
```

响应中应有正确的 `access-control-allow-origin`。

## 11. Privy、Alchemy 和 CRE 回填

1. Privy Dashboard：把 Cloudflare Workers 正式地址加入 Allowed origins/App URLs。
2. Alchemy Dashboard：把 Cloudflare 域名加入 RPC allowlist，并只开放 Sepolia。
3. CRE 配置使用 AWS API 地址：

```dotenv
PUBLIC_API_URL=https://你的ECS地址
CRE_API_BASE_URL=https://你的ECS地址
```

4. 本地运行：

```bash
pnpm cre:preflight
```

`ORACLE_API_KEY` 必须在 AWS Secrets Manager 和本地 CRE `secrets.yaml` 中保持一致，但不要提交 Git，也不要发送给他人。

## 12. 最终验收清单

- [ ] RDS `Public access = No`。
- [ ] RDS 5432 只允许 `w3u-api-sg`。
- [ ] ECS `/health` 返回 200，CloudWatch 无 migration/startup 错误。
- [ ] Cloudflare 首页、课程、个人中心和管理页正常。
- [ ] 浏览器从 Cloudflare Origin 请求 AWS API 时没有 CORS 错误。
- [ ] Privy 登录、钱包连接、Sepolia 读写正常。
- [ ] `PUBLIC_API_URL` 与 `CRE_API_BASE_URL` 都是 ECS HTTPS 地址。
- [ ] CRE preflight 全部通过。
- [ ] `/health` 显示 `fallbackOracle: true`，私钥只存在 Secrets Manager。
- [ ] Git 中没有 `.env`、数据库密码、Privy Secret、Oracle API Key 或私钥。

## 13. 更新部署

API 更新：构建一个不可变 Git SHA tag，推送 ECR，再让 ECS Express Mode 使用新 tag；健康检查失败时不要删除旧镜像。

```bash
docker buildx build \
  --platform linux/amd64 \
  --file Dockerfile.api \
  --tag "<ECR_URI>:<GIT_SHA>" \
  --push \
  .
```

前端更新：

```bash
pnpm cloudflare:deploy
```

数据库 migration 只能向前兼容滚动部署。破坏性 schema 修改必须拆成“先扩展、再切换代码、最后清理”的多次发布。
