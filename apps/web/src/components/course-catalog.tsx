"use client";

import { useEffect, useState } from "react";
import { apiUrl, type CourseCatalogResponse } from "../lib/course-data";
import { CourseCard } from "./course-card";

export function CourseCatalog() {
  const [data, setData] = useState<CourseCatalogResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiUrl}/courses`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog_unavailable");
        setData(await response.json() as CourseCatalogResponse);
      })
      .catch((reason) => {
        if (reason instanceof Error && reason.name !== "AbortError") setError("暂时无法读取链上课程，请确认 API、RPC 和部署地址。");
      });
    return () => controller.abort();
  }, []);

  if (error) return <div className="data-state error-state">{error}</div>;
  if (!data) return <div className="data-state">正在合并链上课程与数据库详情…</div>;
  if (data.courses.length === 0) return <div className="data-state">链上目前没有 Active 课程。</div>;

  return <>
    {data.degraded ? <div className="source-notice">Subgraph 暂不可用，当前使用 RPC 降级数据；课程事实仍来自合约。</div> : null}
    {!data.degraded && data.index && !data.index.caughtUp ? <div className="source-notice partial-notice">Subgraph 正在追赶链头，当前落后 {data.index.lagBlocks ?? "未知"} 个区块。</div> : null}
    {data.index?.hasIndexingErrors ? <div className="source-notice error-state">Subgraph 报告索引错误，当前数据可能不完整。</div> : null}
    {data.courses.some((course) => course.partial) ? <div className="source-notice partial-notice">部分课程的链下详情尚未同步。</div> : null}
    <div className="course-grid">{data.courses.map((course) => <CourseCard course={course} key={course.courseId}/>)}</div>
  </>;
}
