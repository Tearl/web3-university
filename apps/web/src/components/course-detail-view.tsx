"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiUrl, courseAccent, formatDuration, teacherName, type MixedCourseResponse } from "../lib/course-data";
import { CourseChainState } from "./course-chain-state";
import { CourseComments } from "./course-comments";
import { CourseLearningProgress } from "./course-learning-progress";
import { CoursePurchase } from "./course-purchase";
import { Icon } from "./icons";

const statusLabels = ["待审核", "Active", "已拒绝", "已下架"];

export function CourseDetailView({ courseId }: { courseId: string }) {
  const [data, setData] = useState<MixedCourseResponse | null>(null);
  const [error, setError] = useState("");
  const [purchaseRevision, setPurchaseRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiUrl}/courses/${courseId}/mixed`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) throw new Error("not_found");
        if (!response.ok) throw new Error("unavailable");
        setData(await response.json() as MixedCourseResponse);
      })
      .catch((reason) => {
        if (reason instanceof Error && reason.name !== "AbortError") setError(reason.message === "not_found" ? "链上不存在这门课程。" : "暂时无法读取课程，请确认 API、RPC 和部署地址。");
      });
    return () => controller.abort();
  }, [courseId]);

  if (error) return <main className="shell section"><div className="data-state error-state">{error}<br/><Link className="text-link" href="/">返回课程列表</Link></div></main>;
  if (!data) return <main className="shell section"><div className="data-state">正在合并链上课程与数据库详情…</div></main>;

  const course = data.course;
  const detail = course.detail;
  const title = detail?.title ?? `链上课程 #${course.courseId}`;
  const totalDuration = course.lessons.reduce((total, lesson) => total + lesson.durationSec, 0);
  const teacher = teacherName(course);

  return <main>
    {data.degraded ? <div className="source-banner">Subgraph 暂不可用，当前由 RPC 直接验证课程事实。</div> : null}
    <section className="detail-hero"><div className="shell breadcrumbs"><Link href="/">首页</Link><span>/</span><Link href="/#courses">课程</Link><span>/</span><b>{title}</b></div><div className="shell detail-grid"><div><div className="tag-row"><span className="tag">链上课程</span><span className="tag subtle">{statusLabels[course.status] ?? "未知"}</span></div><h1>{title}</h1><p className="lead">{detail?.description ?? "课程详情正在从数据库同步，链上课程事实已验证。"}</p><div className="detail-facts"><span><Icon name="clock"/>{formatDuration(totalDuration)}</span><span><Icon name="book"/>{course.lessons.length} 节课程</span><span><Icon name="shield"/>Course #{course.courseId}</span></div><div className="teacher-line"><span className="avatar large-avatar">{teacher.slice(0, 1)}</span><span><small>课程讲师</small><b>{teacher}</b><code title={course.teacher}>{course.teacher.slice(0, 10)}…{course.teacher.slice(-8)}</code></span></div></div><aside className="purchase-panel"><div className={`panel-cover ${courseAccent(course.courseId)}`}><span className="panel-cover-label">COURSE #{course.courseId}</span><button className="play-button" aria-label="试看课程"><Icon name="play"/></button></div><div className="purchase-body"><CoursePurchase courseId={BigInt(course.courseId)} onPurchased={() => setPurchaseRevision((revision) => revision + 1)}/><button className="button ghost block"><Icon name="play"/>试看课程</button><ul className="included"><li><Icon name="check"/>永久访问全部章节</li><li><Icon name="check"/>课程源码与练习</li><li><Icon name="check"/>完成后领取链上证书</li></ul></div></aside></div></section>
    <section className="shell detail-content"><div className="content-main"><div className="content-block"><div className="block-title"><h2>课程目录</h2><span>{course.lessons.length} 个章节 · {formatDuration(totalDuration)}</span></div><div className="syllabus">{course.lessons.length === 0 ? <div className="lesson-row">链下课时尚未同步</div> : course.lessons.map((lesson, index) => <div className="lesson-row" key={lesson.id}><span className="lesson-index">{String(index + 1).padStart(2, "0")}</span><span className="lesson-play"><Icon name="book"/></span><b>{lesson.title}</b><span className="lesson-time">{formatDuration(lesson.durationSec)}</span></div>)}</div></div><CourseLearningProgress courseId={course.courseId} lessons={course.lessons} refreshKey={purchaseRevision}/><CourseComments courseId={course.courseId}/></div><CourseChainState courseId={BigInt(course.courseId)}/></section>
  </main>;
}
