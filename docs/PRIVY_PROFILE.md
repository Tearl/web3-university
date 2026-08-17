# Privy 身份与 EIP-712 资料签名（P4）

## 安全流程

```text
Privy 登录取得 access token
→ API 验证 token 并读取用户 linked accounts
→ 用户提交绑定钱包和目标 username
→ API 持久化 5 分钟 nonce，并返回固定 domain/types/message
→ 绑定钱包签署 EIP-712 UpdateProfile
→ API 恢复签名地址并逐字段核对
→ 同一数据库事务消费 nonce 并更新资料
```

access token 仅证明 Privy 用户身份；API 还会读取 Privy 用户对象确认钱包确实绑定。token、签名和完整请求体不会写入日志。

## 配置

在 Privy Dashboard 创建测试应用，允许 `http://localhost:3000`，然后在 `.env` 配置：

```dotenv
NEXT_PUBLIC_PRIVY_APP_ID=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_VERIFICATION_KEY=
CHAIN_ID=31337
WEB_ORIGIN=http://localhost:3000
```

`PRIVY_VERIFICATION_KEY` 可选；设置后，服务端验证 access token 时不需要首次远程获取验证 key。服务端 secret 绝不能使用 `NEXT_PUBLIC_` 前缀。

API 运行时和 Prisma CLI 都会自动读取仓库根目录的 `.env.local` 和 `.env`（前者优先）。填写完成后执行：

```bash
pnpm config:check
```

该命令只输出每项是否已配置，不会打印密钥内容。`GET /health` 也仅返回功能就绪布尔值。如果 Privy 未配置，需要身份的接口会明确返回 `503 identity_not_configured`，而不会误报 token 无效。

前端配置为每位登录用户创建 Privy embedded EVM wallet，资料签名固定使用该钱包；服务端仍会再次确认它存在于该用户的 linked accounts 中。

## EIP-712 契约

Domain：

```text
name: Web3University
version: 1
chainId: 31337
```

`UpdateProfile` 包含 `privyDid`、`wallet`、`username`、`nonce` 和 `expiresAt`。服务端生成并持久化所有字段，客户端不能替换任何一个字段后复用签名。

## API

三个接口均要求 Bearer token：

```text
GET /profile
POST /profile/nonce
PATCH /profile
```

## 已覆盖攻击场景

- 重放同一签名
- 使用过期 nonce
- A 用户 token 与 B 钱包混用
- 签名后篡改 username
- 错误 EIP-712 domain
- 错误 chainId
- 使用未绑定钱包
