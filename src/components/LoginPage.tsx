import { useState } from "react";
import { BookOpenText, KeyRound } from "lucide-react";

export default function LoginPage({
  onAuthenticated,
}: {
  onAuthenticated: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "登录失败");
      onAuthenticated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="welcome-mark"><BookOpenText aria-hidden="true" /></div>
        <p className="eyebrow">LAN Reader</p>
        <h1>这个书架需要访问码</h1>
        <p>输入启动服务时设置的访问码，验证后才能阅读文档。</p>
        <label>
          <KeyRound aria-hidden="true" />
          <input
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="访问码"
            autoFocus
            autoComplete="current-password"
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={!code || loading}>
          {loading ? "正在验证…" : "进入书架"}
        </button>
      </form>
    </main>
  );
}
