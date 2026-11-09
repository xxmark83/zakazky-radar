"use client";

import { useEffect, useState } from "react";
import { MB_LOGO } from "@/lib/logo";

export default function Login() {
  const [name, setName] = useState("");
  const [multi, setMulti] = useState(false);
  const [password, setPassword] = useState("");
  // druhý krok: kód z aplikace (Google Authenticator, 1Password…) nebo záložní kód
  const [need2fa, setNeed2fa] = useState(false);
  const [code, setCode] = useState("");
  useEffect(() => {
    fetch("/api/login")
      .then((r) => r.json())
      .then((d) => setMulti(Boolean(d.multi)))
      .catch(() => {});
  }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password, code: need2fa ? code : undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.need2fa && res.ok) {
        setNeed2fa(true);
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error(d.error ?? `Chyba ${res.status}`);
      // jen adresy v rámci appky, ať se přes odkaz nedá přesměrovat jinam
      const next = new URLSearchParams(location.search).get("next") ?? "/";
      location.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit}>
        <svg viewBox="0 0 456 312" width="52" height="36" aria-hidden="true">
          <path fill="var(--accent)" fillRule="evenodd" d={MB_LOGO} />
        </svg>
        <h1>Zakázky radar</h1>
        <p className="sub">
          {multi ? "Zadej jméno a heslo." : "Zadej heslo."} Toto zařízení si přihlášení pamatuje 90 dní.
        </p>
        {multi ? (
          <>
            <label htmlFor="name">Jméno</label>
            <input
              id="name"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </>
        ) : (
          // skryté jméno, aby správce hesel v prohlížeči heslo správně uložil
          <input type="text" name="username" autoComplete="username" value="zakazky-radar" readOnly hidden />
        )}
        <label htmlFor="pw">Heslo</label>
        <input
          id="pw"
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus={!multi}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {need2fa && (
          <>
            <label htmlFor="code">Kód z aplikace</label>
            <input
              id="code"
              name="one-time-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123 456"
            />
            <p className="hint">Šestimístný kód z ověřovací aplikace, nebo jeden ze záložních kódů.</p>
          </>
        )}
        {error && <div className="warn">{error}</div>}
        <button className="primary big" disabled={busy || !password || (need2fa && !code)}>
          {busy ? "Přihlašuji…" : need2fa ? "Ověřit" : "Přihlásit"}
        </button>
      </form>
    </main>
  );
}
