import Link from "next/link";
import type { DemoCourse } from "../lib/demo-data";
import { Icon } from "./icons";

export function CourseCard({ course }: { course: DemoCourse }) {
  return (
    <article className="course-card">
      <Link href={`/courses/${course.id}`} className={`course-cover ${course.accent}`} aria-label={`查看${course.title}`}>
        <span className="cover-orbit" />
        <span className="cover-code">{course.category === "DeFi" ? "x · y = k" : course.category === "全栈" ? "{ DApp }" : "0x / SOL"}</span>
        <span className="level-pill">{course.level}</span>
      </Link>
      <div className="course-body">
        <div className="course-meta"><span>{course.category}</span><span>{course.students} 人在学</span></div>
        <Link href={`/courses/${course.id}`}><h3>{course.title}</h3></Link>
        <p>{course.description}</p>
        <div className="teacher-row"><span className="avatar">{course.teacher.slice(0, 1)}</span><span>{course.teacher}</span></div>
        <div className="course-footer"><strong>{course.price}</strong><Link className="text-link" href={`/courses/${course.id}`}>查看课程 <Icon name="arrow" /></Link></div>
      </div>
    </article>
  );
}
