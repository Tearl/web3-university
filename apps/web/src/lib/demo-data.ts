export type DemoCourse = {
  id: string;
  title: string;
  description: string;
  longDescription: string;
  level: string;
  category: string;
  teacher: string;
  teacherAddress: string;
  price: string;
  duration: string;
  lessons: number;
  students: number;
  progress?: number;
  accent: "violet" | "cyan" | "amber";
  syllabus: { title: string; duration: string; preview?: boolean }[];
};

export const demoCourses: DemoCourse[] = [
  {
    id: "solidity-foundations",
    title: "Solidity 智能合约入门",
    description: "从 EVM、状态变量到一份经过测试的课程市场合约。",
    longDescription:
      "从链上状态的基本概念出发，逐步掌握 Solidity 语法、权限控制、事件与测试，最终完成一份可以部署到 Sepolia 的课程市场合约。",
    level: "入门",
    category: "智能合约",
    teacher: "Alex Chen",
    teacherAddress: "0x71C7...42E9",
    price: "4 YD",
    duration: "5.5 小时",
    lessons: 12,
    students: 328,
    progress: 72,
    accent: "violet",
    syllabus: [
      { title: "为什么区块链需要智能合约", duration: "18 分钟", preview: true },
      { title: "EVM、账户与 Gas", duration: "26 分钟", preview: true },
      { title: "Solidity 类型与状态变量", duration: "34 分钟" },
      { title: "函数、修饰器与错误处理", duration: "31 分钟" },
      { title: "ERC-20 与 OpenZeppelin", duration: "42 分钟" },
      { title: "完成 CourseMarket 合约", duration: "58 分钟" },
    ],
  },
  {
    id: "defi-uniswap",
    title: "DeFi 与 Uniswap 实战",
    description: "理解 AMM、流动性和滑点，并亲手创建一组测试网资金池。",
    longDescription:
      "用可视化例子理解自动做市商的数学模型，在测试网发行资产、添加流动性，并学习如何安全地处理报价、滑点与交易回执。",
    level: "进阶",
    category: "DeFi",
    teacher: "Mia Wang",
    teacherAddress: "0x92A1...18B0",
    price: "6 YD",
    duration: "7 小时",
    lessons: 16,
    students: 214,
    progress: 36,
    accent: "cyan",
    syllabus: [
      { title: "DeFi 的组成与风险", duration: "24 分钟", preview: true },
      { title: "恒定乘积公式 x · y = k", duration: "38 分钟" },
      { title: "价格影响与滑点保护", duration: "31 分钟" },
      { title: "创建 WETH / YD 测试池", duration: "52 分钟" },
      { title: "读取报价并发起 Swap", duration: "46 分钟" },
    ],
  },
  {
    id: "dapp-fullstack",
    title: "DApp 全栈工程",
    description: "串起钱包登录、事件索引、链下服务与 Oracle 的完整闭环。",
    longDescription:
      "站在产品工程视角理解一个 DApp 如何分配链上与链下职责，并完成身份、交易、索引、API 和去中心化验证之间的数据流。",
    level: "项目",
    category: "全栈",
    teacher: "Leo Zhang",
    teacherAddress: "0x4F10...C321",
    price: "8 YD",
    duration: "9 小时",
    lessons: 20,
    students: 156,
    accent: "amber",
    syllabus: [
      { title: "DApp 的信任边界", duration: "28 分钟", preview: true },
      { title: "Privy 登录与钱包连接", duration: "44 分钟" },
      { title: "使用 viem 读取与写入合约", duration: "51 分钟" },
      { title: "用 The Graph 索引事件", duration: "47 分钟" },
      { title: "Chainlink Functions 完成度验证", duration: "56 分钟" },
    ],
  },
];

export function findDemoCourse(id: string) {
  return demoCourses.find((course) => course.id === id);
}
