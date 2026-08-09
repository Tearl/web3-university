import type { Metadata } from "next";
import { SiteHeader } from "../components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web3 University",
  description: "链上购买、链下学习、NFT 认证的半中心化大学",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <div className="shell footer-inner">
            <div><div className="brand footer-brand"><span className="brand-mark">W3</span><span>Web3 <em>University</em></span></div><p>在测试网上学习，在链上拥有你的成果。</p></div>
            <div className="footer-note"><span>Sepolia 测试网</span><span>仅供教学演示，不使用真实资金</span></div>
          </div>
        </footer>
      </body>
    </html>
  );
}
