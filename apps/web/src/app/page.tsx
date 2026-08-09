import Link from "next/link";
import { CourseCard } from "../components/course-card";
import { Icon } from "../components/icons";
import { demoCourses } from "../lib/demo-data";

export default function HomePage() {
  return (
    <main>
      <section className="hero-section">
        <div className="hero-glow" />
        <div className="shell hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Learn · Verify · Own</div>
            <h1>让每一次学习，<br/><span>都成为链上履历。</span></h1>
            <p className="lead">从智能合约到 DApp 全栈，在真实的测试网环境中边学边做。课程购买可验证，学习成果由不可转让的 NFT 证书永久记录。</p>
            <div className="actions"><a className="button primary large" href="#courses">开始探索 <Icon name="arrow" /></a><Link className="button ghost large" href="/courses/solidity-foundations"><Icon name="play" /> 免费试看</Link></div>
            <div className="hero-stats"><div><strong>12+</strong><span>实战课程</span></div><div><strong>698</strong><span>链上学习者</span></div><div><strong>324</strong><span>已颁发证书</span></div></div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="chain-ring ring-one"/><div className="chain-ring ring-two"/>
            <div className="certificate-card"><div className="cert-top"><span className="brand-mark">W3</span><span>ON-CHAIN CERTIFICATE</span></div><div className="cert-seal"><Icon name="award" /></div><small>CERTIFICATE OF COMPLETION</small><strong>Solidity Developer</strong><div className="cert-address">0x71C7 ··· 42E9</div></div>
            <div className="float-chip chip-verified"><Icon name="shield"/><span><small>链上验证</small><b>Verified</b></span></div>
            <div className="float-chip chip-token"><span className="token-mark">YD</span><span><small>课程价格</small><b>4.00 YD</b></span></div>
          </div>
        </div>
      </section>

      <section className="trust-strip"><div className="shell trust-inner"><span>技术栈</span><b>Solidity</b><b>Next.js</b><b>Privy</b><b>The Graph</b><b>Chainlink</b></div></section>

      <section className="shell section" id="courses">
        <div className="section-heading"><div><div className="eyebrow">CURATED COURSES</div><h2>从第一笔交易开始</h2></div><p>每门课程都围绕一个可运行的 Web3 项目展开，<br/>把概念变成你真正写过的代码。</p></div>
        <div className="course-grid">{demoCourses.map((course) => <CourseCard course={course} key={course.id}/>)}</div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="shell section">
          <div className="center-heading"><div className="eyebrow">HOW IT WORKS</div><h2>一条看得见的学习路径</h2><p>链下保持学习体验，链上负责关键事实。你会在使用产品的同时理解它。</p></div>
          <div className="process-grid">
            <div className="process-card"><span className="step-number">01</span><div className="process-icon"><Icon name="wallet"/></div><h3>连接钱包</h3><p>使用 Privy 登录并创建或连接钱包，切换到 Sepolia 测试网。</p></div>
            <div className="process-card"><span className="step-number">02</span><div className="process-icon"><Icon name="book"/></div><h3>购买课程</h3><p>授权 YD 后调用课程市场合约，交易记录公开且可验证。</p></div>
            <div className="process-card"><span className="step-number">03</span><div className="process-icon"><Icon name="check"/></div><h3>完成学习</h3><p>观看章节、完成练习，学习进度安全保存在链下数据库。</p></div>
            <div className="process-card"><span className="step-number">04</span><div className="process-icon"><Icon name="award"/></div><h3>领取证书</h3><p>Oracle 验证完成度后，为你的地址铸造不可转让证书。</p></div>
          </div>
        </div>
      </section>

      <section className="shell cta-section"><div><div className="eyebrow">BUILD IN PUBLIC</div><h2>准备好写下第一笔<br/>链上学习记录了吗？</h2><p>从免费试看开始，不需要真实资产。</p></div><Link className="button light large" href="/courses/solidity-foundations">进入第一课 <Icon name="arrow"/></Link></section>
    </main>
  );
}
