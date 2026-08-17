import { TokenSwap } from "../../components/token-swap";

export default function SwapPage() {
  return (
    <main className="swap-page">
      <section className="shell swap-heading">
        <div className="eyebrow"><span /> STAGE F · UNISWAP V3</div>
        <h1>兑换课程所需的 YD</h1>
        <p>使用 Sepolia 测试 WETH 或 mUSDC，经 Uniswap V3 教学池兑换 YD。所有资产均无真实价值。</p>
      </section>
      <section className="shell swap-layout">
        <TokenSwap />
        <aside className="swap-guide">
          <div className="eyebrow">测试流程</div>
          <ol>
            <li><b>准备测试资产</b><span>领取 1,000 mUSDC，或将少量 Sepolia ETH 包装为 WETH。</span></li>
            <li><b>检查实时报价</b><span>QuoterV2 返回预计 YD、价格影响和最小到账。</span></li>
            <li><b>有限授权并兑换</b><span>只授权本次输入数量，链上网关强制滑点和截止时间。</span></li>
            <li><b>使用 YD 购买</b><span>到账后进入课程页完成 4 YD 的购买交易。</span></li>
          </ol>
        </aside>
      </section>
    </main>
  );
}
