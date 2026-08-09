import { Icon } from "../../components/icons";

const submissions = [
  { name: "Solidity 智能合约入门", id: "#001", status: "已上架", tone: "active", date: "2026-08-02", students: 328 },
  { name: "DAO 治理机制设计", id: "#004", status: "审核中", tone: "pending", date: "2026-08-08", students: 0 },
  { name: "链上数据分析基础", id: "#005", status: "草稿", tone: "draft", date: "2026-08-09", students: 0 },
];

export default function AdminPage() {
  return (
    <main className="dashboard-page shell">
      <div className="dashboard-heading"><div><div className="eyebrow">TEACHER STUDIO</div><h1>教师中心</h1><p>管理课程资料，并追踪它们从链下草稿到链上发布的状态。</p></div><button className="button primary"><span className="plus">＋</span> 创建新课程</button></div>
      <div className="dashboard-stats"><div><span className="stat-icon violet"><Icon name="book"/></span><span><small>课程总数</small><strong>3</strong></span></div><div><span className="stat-icon cyan"><Icon name="users"/></span><span><small>学习人数</small><strong>328</strong></span></div><div><span className="stat-icon amber"><span className="token-small">YD</span></span><span><small>累计收入</small><strong>1,312 YD</strong></span></div><div><span className="stat-icon green"><Icon name="award"/></span><span><small>结业证书</small><strong>126</strong></span></div></div>

      <section className="dashboard-card"><div className="card-heading"><div><h2>我的课程</h2><p>链下资料和链上状态会在这里合并展示</p></div><div className="filter-tabs"><button className="active">全部</button><button>已上架</button><button>审核中</button><button>草稿</button></div></div><div className="table-wrap"><table><thead><tr><th>课程</th><th>链上状态</th><th>提交日期</th><th>学习人数</th><th>操作</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.id}><td><span className="mini-cover">{item.id}</span><span><b>{item.name}</b><small>Course {item.id}</small></span></td><td><span className={`status-badge ${item.tone}`}>{item.status}</span></td><td>{item.date}</td><td>{item.students}</td><td><button className="more-button">•••</button></td></tr>)}</tbody></table></div></section>

      <section className="workflow-card"><div><div className="eyebrow">PUBLISHING FLOW</div><h2>一门课程如何上链？</h2><p>内容本身保存在数据库与对象存储；课程身份、价格和审核状态由合约维护。</p></div><div className="mini-flow"><span><b>1</b>填写资料<em>链下草稿</em></span><i>→</i><span><b>2</b>提交交易<em>Pending</em></span><i>→</i><span><b>3</b>Reviewer 审核<em>角色控制</em></span><i>→</i><span><b>4</b>课程上架<em>Active</em></span></div></section>
    </main>
  );
}
