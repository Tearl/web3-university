import Link from "next/link";
import { Icon } from "../../components/icons";
import { demoCourses } from "../../lib/demo-data";

export default function ProfilePage() {
  return (
    <main className="profile-page">
      <section className="profile-banner"><div className="shell profile-intro"><div className="profile-avatar">Z<span className="verified-mark">✓</span></div><div><div className="profile-name"><h1>Zhaoyu</h1><span>已连接</span></div><code>0x71C7f8205B7a91c3 ··· 42E9</code><p>在测试网上构建我的第一份 Web3 学习履历。</p></div><button className="button ghost">编辑资料</button></div></section>
      <div className="shell profile-layout">
        <div className="profile-main">
          <section><div className="block-title"><div><div className="eyebrow">MY LEARNING</div><h2>继续学习</h2></div><span>2 门进行中</span></div><div className="learning-list">{demoCourses.slice(0, 2).map((course) => <article key={course.id}><div className={`learning-cover ${course.accent}`}>{course.category === "DeFi" ? "x · y = k" : "0x / SOL"}</div><div className="learning-info"><span className="tag subtle">{course.category}</span><h3>{course.title}</h3><div className="progress-label"><span>学习进度</span><b>{course.progress}%</b></div><div className="progress-track"><span style={{ width: `${course.progress}%` }}/></div><Link className="text-link" href={`/courses/${course.id}`}>继续学习 <Icon name="arrow"/></Link></div></article>)}</div></section>
          <section className="certificate-section"><div className="block-title"><div><div className="eyebrow">ACHIEVEMENTS</div><h2>链上证书</h2></div><span>1 枚证书</span></div><div className="owned-cert"><div className="cert-art"><div className="cert-seal"><Icon name="award"/></div><span>W3 UNIVERSITY</span><strong>Solidity<br/>Developer</strong><small>SOULBOUND · #000128</small></div><div className="cert-copy"><span className="status-badge active">已验证</span><h3>Solidity 智能合约入门</h3><p>由 CompletionOracle 验证学习完成度，并通过 CourseCertificate 合约铸造。</p><dl><div><dt>获得日期</dt><dd>2026-08-06</dd></div><div><dt>Token ID</dt><dd>#128</dd></div><div><dt>网络</dt><dd>Sepolia</dd></div></dl><button className="button ghost">在区块浏览器查看 <Icon name="arrow"/></button></div></div></section>
        </div>
        <aside className="profile-side"><div className="side-card"><div className="eyebrow">YOUR STATS</div><h3>学习概览</h3><div className="side-stat"><span><Icon name="book"/></span><b>2<small>已购课程</small></b></div><div className="side-stat"><span><Icon name="clock"/></span><b>8.4h<small>累计学习</small></b></div><div className="side-stat"><span><Icon name="award"/></span><b>1<small>链上证书</small></b></div></div><div className="side-card safety-card"><Icon name="shield"/><h3>身份如何验证？</h3><p>修改用户名时，服务端会同时检查 Privy 登录凭据、钱包签名和一次性 nonce。</p><a href="#">了解安全设计 →</a></div></aside>
      </div>
    </main>
  );
}
