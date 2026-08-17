# 教师与审核中心

阶段 A 已把 `/admin` 改为真实的 CourseMarket 操作台。课程详情和课时先保存到 PostgreSQL 草稿；教师钱包确认 `submitCourse` 后，API 校验交易回执中的 `CourseSubmitted` 事件，再用事件里的真实 `courseId` 原子写入课程详情和课时。审核、拒绝、下架均直接发送链上交易。

## 启动前准备

1. 启动 Anvil、部署并 seed 本地合约。
2. 启动 PostgreSQL，并运行：

   ```bash
   pnpm --filter @web3-university/api db:migrate
   ```

3. 在 Privy 控制台允许 `http://localhost:3000`，然后启动 API 和 Web。
4. 复制教师和审核员在 Privy 中绑定的 EVM 钱包地址。使用管理员私钥执行角色脚本（私钥只放终端环境变量，不能写进前端）：

   ```bash
   LOCAL_COURSE_MARKET_ADDRESS=<CourseMarket地址> \
   LOCAL_TEACHER_ADDRESS=<教师钱包> \
   LOCAL_REVIEWER_ADDRESS=<审核员钱包> \
   LOCAL_PRIVATE_KEY=<本地管理员私钥> \
   forge script packages/contracts/script/GrantCourseRoles.s.sol:GrantCourseRoles \
     --rpc-url http://127.0.0.1:8545 --broadcast
   ```

本地演示可以把两个角色授予同一个 Privy 钱包；实际环境建议分开。

## 验收流程

1. 教师登录 `/admin`，填写一门价格为 4 YD 的课程并保存草稿。
2. 点击“提交上链”，钱包确认后页面显示真实 Course ID 和“审核中”。拒签或 RPC 失败时草稿仍保留。
3. Reviewer 登录同一页面，依次验证“拒绝”“上架”“下架”交易；刷新后状态必须来自合约。
4. 上架后检查合约 `courses(id).status == 1`，并访问 `GET /courses/:id` 确认数据库使用相同 ID。

安全边界：API 使用 Privy access token 校验身份、绑定钱包校验归属，并从链上再次读取 `TEACHER_ROLE`；链上合约负责最终限制教师提交和 Reviewer 状态操作。API 不接受浏览器上报的 courseId，只接受已确认交易中的事件值。
