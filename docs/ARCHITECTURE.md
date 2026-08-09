# 架构说明

## 数据边界

| 数据 | 权威来源 |
|---|---|
| 课程 ID、老师、价格、状态 | CourseMarket 合约 |
| 购买资格 | CourseMarket `purchased` 映射 |
| YD 余额与授权 | YDToken 合约 |
| 证书所有权 | CourseCertificate 合约 |
| 标题、描述、章节、视频、评论 | PostgreSQL / 对象存储 |
| 学习进度 | PostgreSQL |
| 列表与历史查询 | The Graph（链上事件派生） |

## 核心流程

1. 老师上传链下资料并调用 `submitCourse`。
2. Reviewer 调用 `approveCourse` 后课程可购买。
3. 学生先 `YD.approve`，再调用 `CourseMarket.buy`。
4. 后端读取链上购买资格后签发视频短时效 URL。
5. 学习达到 100% 后，Chainlink Functions 查询只读完成度 API。
6. Oracle 回调成功后，证书合约铸造不可转让 ERC721。

## 信任边界

Chainlink 负责把 API 响应送上链，但不保证项目方数据库的原始数据真实。Oracle API 必须使用 nonce、过期时间、Secrets、速率限制和 evidence hash。
