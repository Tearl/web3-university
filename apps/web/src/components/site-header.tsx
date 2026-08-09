import Link from "next/link";
import { Icon } from "./icons";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Web3 University 首页">
          <span className="brand-mark">W3</span>
          <span>Web3 <em>University</em></span>
        </Link>
        <nav className="nav" aria-label="主导航">
          <Link href="/#courses">探索课程</Link>
          <Link href="/#how-it-works">学习流程</Link>
          <Link href="/admin">教师中心</Link>
          <Link href="/profile">我的学习</Link>
        </nav>
        <button className="button wallet-button"><span className="status-dot" />连接钱包</button>
        <button className="menu-button" aria-label="打开菜单"><Icon name="menu" /></button>
      </div>
    </header>
  );
}
