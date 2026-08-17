# 本地 Anvil 链操作手册

## 安全边界

本手册只用于 Anvil 本地测试链：

- RPC：`http://127.0.0.1:8545`
- Chain ID：`31337`
- 测试助记词：Anvil 默认公开助记词
- 代币和 ETH：全部没有现实价值

默认助记词和对应私钥已公开，不得用在 Sepolia 或主网。

## 1. 启动本地链

```bash
anvil --host 127.0.0.1 --port 8545 --chain-id 31337
```

另开一个终端确认链 ID：

```bash
cast chain-id --rpc-url http://127.0.0.1:8545
```

必须返回 `31337`。

## 2. 运行测试

```bash
cd packages/contracts
forge fmt --check
forge test -vvv
```

当前基线：9 个测试全部通过。

## 3. 部署和授权

```bash
forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  -vvv
```

为前端读链创建三门已审批的本地演示课程：

```bash
LOCAL_YD_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3 \
LOCAL_COURSE_MARKET_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
forge script script/SeedLocal.s.sol:SeedLocal \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
```

该脚本同时从本地 treasury 向默认 student（Anvil 账户 5）转入
100 YD，用于前端的精确授权和购买测试。

Anvil 每次从空链启动时，默认部署地址为：

| 合约 | 地址 |
|---|---|
| YDToken | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| CourseMarket | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| CourseCertificate | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| CompletionOracle | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |

实际地址以脚本输出和
`broadcast/DeployLocal.s.sol/31337/run-latest.json` 为准。

## 4. 默认角色账户

| 索引 | 地址 | 用途 |
|---:|---|---|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | admin / reviewer / pauser / deployer |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | teacher |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | oracle callback |
| 3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | treasury |
| 5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | student |

## 5. 已验收主链路

2026-08-12 在 chain `31337` 上完成了：

1. 教师提交价格为 25 YD 的课程。
2. Reviewer 将课程设为 Active。
3. Treasury 向学生转入 100 YD。
4. 学生对 CourseMarket 授权 25 YD 并购买。
5. `hasPurchased(student, 1)` 返回 `true`。
6. Treasury 最终余额为 999,925 YD，即 `1,000,000 - 100 + 25`。
7. 学生发起完课请求，Oracle 履约并铸造证书 1。
8. `certificateOf(student, 1)` 返回 `1`，`ownerOf(1)` 返回学生地址。

本次购买交易 hash：

```text
0x84d753e0ed3f37e8c8c28dfaca1e4f4c8094590b3e3f71396da8c47661704887
```

receipt 的 `status` 为 `1`，日志同时包含 YD `Transfer` 和
CourseMarket `CoursePurchased` 事件。由于 Anvil 是内存链，停止后这些地址和交易不再可查；
重启并重新部署即可复现。

## 6. P2 前端购买状态机验收

2026-08-12 使用默认 student 和课程 1 完成了与前端相同的交易顺序：

1. 初始余额 100 YD，allowance 为 0。
2. 授权前的交易模拟成功，仅授权课程精确价格 4 YD。
3. 授权 receipt 的 `status` 为 `1`。
4. 购买前的交易模拟成功，购买 receipt 的 `status` 为 `1`。
5. 最终余额为 96 YD，allowance 为 0，`hasPurchased(student, 1)` 为 `true`。

本次本地交易 hash：

```text
approve: 0xc11276cb24b637d422463aeb5ed2ac5e7bba7f6c5c8a551e11a92b74832ab106
buy:     0x955582b8115abc307fda87c1d84aa3f29e06fcebfd55558b1c28a258e89f7b04
```
