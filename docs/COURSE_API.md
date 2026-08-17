# 课程内容 API（P3）

课程购买事实来自 `CourseMarket`，标题、章节和视频对象 key 保存在 PostgreSQL。数据库内容被删除或修改，不会改变链上的购买记录。

## 初始化数据库

复制根目录 `.env.example` 为 `.env`，确认 `DATABASE_URL` 指向可用的 PostgreSQL，然后执行。项目容器默认使用宿主机 `5433` 端口，以避免与本机 PostgreSQL 的常用 `5432` 端口冲突。

```bash
pnpm --filter @web3-university/api db:generate
pnpm --filter @web3-university/api db:migrate
pnpm --filter @web3-university/api db:seed
```

seed 可重复执行，会写入与本地 `SeedLocal.s.sol` 对应的 3 门课程和演示课时。

## 读取接口

```text
GET /courses/:courseId
GET /courses/:courseId/lessons
```

所有 `courseId` 都以字符串返回，避免 JavaScript JSON 丢失 BigInt 精度。课时列表不会暴露数据库中的 `videoKey`。

## 开发环境写入接口

以下接口仅在 `NODE_ENV=development` 时开放，并要求请求头 `x-dev-teacher-key` 等于 `DEV_TEACHER_KEY`：

```text
PUT /dev/courses/:courseId
PUT /dev/courses/:courseId/lessons
```

这些接口只用于 P4 身份系统完成前的本地开发，不是生产鉴权方案。

## 视频访问接口

```text
GET /courses/:courseId/lessons/:lessonId/video
Authorization: Bearer <Privy access token>
```

P4 起，接口要求 `Authorization: Bearer <Privy access token>`。API 从已验证 Privy 用户的 linked accounts 中选择 EVM 钱包，再通过 RPC 调用 `CourseMarket.hasPurchased(wallet, courseId)`：

- 未提供或无效 token：`401 access_token_required/invalid_access_token`
- 没有绑定 EVM 钱包：`403 wallet_not_linked`
- 链上未购买：`403 course_not_purchased`
- 课时不存在：`404 lesson_not_found`
- RPC 不可用：`503 chain_unavailable`
- 已购买：返回由 `VIDEO_SIGNING_SECRET` 签名的短时效 URL

客户端自报的钱包地址不会作为可信身份。

## 测试

```bash
pnpm --filter @web3-university/api test
```

API 测试使用内存 repository 和注入的购买校验器，不连接 PostgreSQL，也不依赖公网或本地 RPC。
