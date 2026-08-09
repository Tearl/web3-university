import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../components/icons";
import { demoCourses, findDemoCourse } from "../../../lib/demo-data";

export function generateStaticParams() {
  return demoCourses.map((course) => ({ id: course.id }));
}

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = findDemoCourse(id);
  if (!course) notFound();

  return (
    <main>
      <section className="detail-hero">
        <div className="shell breadcrumbs"><Link href="/">首页</Link><span>/</span><Link href="/#courses">课程</Link><span>/</span><b>{course.title}</b></div>
        <div className="shell detail-grid">
          <div>
            <div className="tag-row"><span className="tag">{course.category}</span><span className="tag subtle">{course.level}</span></div>
            <h1>{course.title}</h1>
            <p className="lead">{course.longDescription}</p>
            <div className="detail-facts"><span><Icon name="clock"/>{course.duration}</span><span><Icon name="book"/>{course.lessons} 节课程</span><span><Icon name="users"/>{course.students} 人学习</span></div>
            <div className="teacher-line"><span className="avatar large-avatar">{course.teacher.slice(0, 1)}</span><span><small>课程讲师</small><b>{course.teacher}</b><code>{course.teacherAddress}</code></span></div>
          </div>
          <aside className="purchase-panel">
            <div className={`panel-cover ${course.accent}`}><span>{course.category === "DeFi" ? "x · y = k" : course.category === "全栈" ? "{ DApp }" : "0x / SOL"}</span><button className="play-button"><Icon name="play"/></button></div>
            <div className="purchase-body"><small>课程价格</small><div className="purchase-price">{course.price}<span>≈ 测试资产</span></div><button className="button primary block">连接钱包后购买</button><button className="button ghost block"><Icon name="play"/>试看前两节</button><ul className="included"><li><Icon name="check"/>永久访问全部章节</li><li><Icon name="check"/>课程源码与练习</li><li><Icon name="check"/>完成后领取链上证书</li></ul><div className="testnet-note"><Icon name="shield"/>本项目仅使用 Sepolia 测试网资产</div></div>
          </aside>
        </div>
      </section>

      <section className="shell detail-content">
        <div className="content-main">
          <div className="content-block"><h2>你将学到什么</h2><div className="learning-grid"><span><Icon name="check"/>理解链上与链下数据边界</span><span><Icon name="check"/>读懂钱包签名与交易生命周期</span><span><Icon name="check"/>使用测试网完成真实交互</span><span><Icon name="check"/>为关键模块编写自动化测试</span></div></div>
          <div className="content-block"><div className="block-title"><h2>课程目录</h2><span>{course.syllabus.length} 个章节 · {course.duration}</span></div><div className="syllabus">{course.syllabus.map((lesson, index) => <div className="lesson-row" key={lesson.title}><span className="lesson-index">{String(index + 1).padStart(2, "0")}</span><span className="lesson-play"><Icon name={lesson.preview ? "play" : "book"}/></span><b>{lesson.title}</b>{lesson.preview && <em>可试看</em>}<span className="lesson-time">{lesson.duration}</span></div>)}</div></div>
        </div>
        <aside className="chain-info"><div className="eyebrow">ON-CHAIN INFO</div><h3>链上课程信息</h3><dl><div><dt>网络</dt><dd><span className="network-dot"/>Sepolia</dd></div><div><dt>课程 ID</dt><dd>#{demoCourses.indexOf(course) + 1}</dd></div><div><dt>支付代币</dt><dd>YD Token</dd></div><div><dt>课程状态</dt><dd className="active-text">● Active</dd></div></dl><p>这些字段最终由 CourseMarket 合约提供，而不是由网站数据库决定。</p></aside>
      </section>
    </main>
  );
}
