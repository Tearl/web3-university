import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const courses = [
  {
    courseId: 1n,
    title: "Solidity 智能合约基础",
    description: "从类型、存储到测试，构建第一个可验证的智能合约。",
    coverUrl: "https://images.unsplash.com/photo-1639762681057-408e52192e55",
    lessons: [
      { title: "开发环境与第一个合约", videoKey: "course-1/lesson-1.mp4", durationSec: 120, orderIndex: 0 },
      { title: "状态变量与函数", videoKey: "course-1/lesson-2.mp4", durationSec: 180, orderIndex: 1 },
    ],
  },
  {
    courseId: 2n,
    title: "DeFi 与 Uniswap 实战",
    description: "理解 AMM，并完成兑换与流动性集成。",
    coverUrl: "https://images.unsplash.com/photo-1620321023374-d1a68fbc720d",
    lessons: [
      { title: "AMM 定价模型", videoKey: "course-2/lesson-1.mp4", durationSec: 900, orderIndex: 0 },
    ],
  },
  {
    courseId: 3n,
    title: "全栈 DApp 开发",
    description: "将合约、索引、API 和前端连接为完整应用。",
    coverUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475",
    lessons: [
      { title: "DApp 系统边界", videoKey: "course-3/lesson-1.mp4", durationSec: 840, orderIndex: 0 },
    ],
  },
] as const;

for (const { lessons, ...course } of courses) {
  await prisma.courseDetail.upsert({ where: { courseId: course.courseId }, create: course, update: course });
  for (const lesson of lessons) {
    await prisma.lesson.upsert({
      where: { courseId_orderIndex: { courseId: course.courseId, orderIndex: lesson.orderIndex } },
      create: { courseId: course.courseId, ...lesson },
      update: lesson,
    });
  }
}

await prisma.$disconnect();
