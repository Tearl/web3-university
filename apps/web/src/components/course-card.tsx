import Link from "next/link";
import { formatUnits } from "viem";
import { courseAccent, teacherName, type MixedCourse } from "../lib/course-data";
import { Icon } from "./icons";

export function CourseCard({ course }: { course: MixedCourse }) {
  const title = course.detail?.title ?? `链上课程 #${course.courseId}`;
  const accent = courseAccent(course.courseId);
  return (
    <article className="course-card">
      <Link href={`/courses/${course.courseId}`} className={`course-cover ${accent}`} aria-label={`查看${title}`}>
        <span className="cover-orbit" />
        <span className="cover-code">COURSE #{course.courseId}</span>
        <span className="level-pill">链上已审核</span>
      </Link>
      <div className="course-body">
        <div className="course-meta"><span>Active</span><span>{course.partial ? "详情同步中" : "链上 + 数据库"}</span></div>
        <Link href={`/courses/${course.courseId}`}><h3>{title}</h3></Link>
        <p>{course.detail?.description ?? "课程已在链上审核通过，链下详情暂未同步。"}</p>
        <div className="teacher-row"><span className="avatar">{teacherName(course).slice(0, 1)}</span><span>{teacherName(course)}</span></div>
        <div className="course-footer"><strong>{formatUnits(BigInt(course.priceYD), 18)} YD</strong><Link className="text-link" href={`/courses/${course.courseId}`}>查看课程 <Icon name="arrow" /></Link></div>
      </div>
    </article>
  );
}
