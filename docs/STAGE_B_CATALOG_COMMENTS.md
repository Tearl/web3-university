# 阶段 B：混合课程与评论

## 数据边界

- CourseMarket/Subgraph：课程 ID、教师、YD 价格、审核状态。
- PostgreSQL：标题、描述、封面、教师资料、课时和评论。
- API 只按 `courseId` 合并；数据库不能创建链上不存在的课程，也不能把 Offline 课程标为可购买。

`GET /courses` 优先查询 `SUBGRAPH_URL`。Subgraph 未配置或不可用时，API 读取 `nextCourseId` 并在 `COURSE_SCAN_LIMIT` 范围内通过 RPC 查询，只返回 Active 课程，同时返回 `degraded: true`。

## 接口

```text
GET   /courses
GET   /courses?ids=1,2,3
GET   /courses/:courseId/mixed
GET   /courses/:courseId/comments?limit=20&cursor=...
POST  /courses/:courseId/comments
PATCH /courses/:courseId/comments/:commentId
```

发布评论要求 Privy Bearer token，body 中的钱包必须属于当前 Privy 用户。评论会 trim，长度为 1–1000，每个 DID 默认每分钟最多 5 条。

软隐藏要求 Privy token、绑定钱包和链上 `REVIEWER_ROLE`；隐藏后的评论不会出现在公开列表。React 以文本节点渲染评论，不使用 `dangerouslySetInnerHTML`。

## 本地验收

1. 启动 PostgreSQL、Anvil、API 和 Web，并确保链上至少有一门 Active 课程且 DB 有相同 `courseId` 详情。
2. 首页出现真实课程卡片；未部署 Subgraph 时显示 RPC 降级提示。
3. 打开 `/courses/<链上ID>`，确认价格/教师来自链上，标题/课时来自数据库，页面不暴露 `videoKey`。
4. 未登录只能查看评论；Privy 登录后可以发布，刷新后评论仍存在。
5. 连续快速发布超过 `COMMENT_RATE_LIMIT_PER_MINUTE` 后返回 429。
6. Reviewer 调用软隐藏接口后，评论从公开列表消失。

配置：

```dotenv
SUBGRAPH_URL=
COURSE_SCAN_LIMIT=100
COMMENT_RATE_LIMIT_PER_MINUTE=5
```
