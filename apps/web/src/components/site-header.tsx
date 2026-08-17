"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./icons";
import { WalletButton } from "./wallet-button";

const navigation = [
  ["探索课程", "/#courses"],
  ["学习流程", "/#how-it-works"],
  ["兑换 YD", "/swap"],
  ["教师中心", "/admin"],
  ["我的学习", "/profile"],
] as const;

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Web3 University 首页">
          <span className="brand-mark">W3</span>
          <span>Web3 <em>University</em></span>
        </Link>
        <nav className="nav" aria-label="主导航">
          {navigation.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>
        <WalletButton />
        <button
          className="menu-button"
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        ><Icon name="menu" /></button>
      </div>
      <nav id="mobile-navigation" className={`mobile-nav${menuOpen ? " open" : ""}`} aria-label="移动端导航">
        {navigation.map(([label, href]) => <Link href={href} key={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}
        <WalletButton />
      </nav>
    </header>
  );
}
