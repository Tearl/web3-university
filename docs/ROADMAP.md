# 开发路线

## M1：框架（当前阶段）

- monorepo、Web、API、数据库、合约、Subgraph 目录可构建。
- 课程页和管理页使用示例数据展示边界。

## M2：购买闭环

- 部署 YD 与 CourseMarket。
- 完成老师提交、Owner 审核、approve + buy。
- 接入链上 receipt 和 The Graph。

## M3：身份与内容

- Privy 登录和服务端 token 校验。
- EIP-712 用户名签名修改。
- 视频短时效 URL、评论、学习进度。

## M4：DEX 与证书

- 创建 WETH/YD、MockUSDC/YD 测试池。
- Chainlink CRE 工作流与 KeystoneForwarder 写回。
- ERC721 证书元数据与个人中心展示。

## M5：验收

- 合约、API、E2E、安全和失败路径测试。
- 部署手册、演示数据和 5–8 分钟答辩脚本。
