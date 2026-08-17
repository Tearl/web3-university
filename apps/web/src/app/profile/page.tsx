import { ProfileEditor } from "../../components/profile-editor";
import { LearningDashboard } from "../../components/learning-dashboard";

export default function ProfilePage() {
  return (
    <main className="profile-page">
      <section className="profile-banner"><div className="shell"><div className="profile-intro"><div className="profile-avatar">W3<span className="verified-mark">✓</span></div><div><div className="profile-name"><h1>我的学习身份</h1><span>Privy + EIP-712</span></div><p>登录身份、绑定钱包与一次性签名共同保护资料修改。</p></div></div><ProfileEditor /></div></section>
      <div className="shell"><LearningDashboard /></div>
    </main>
  );
}
