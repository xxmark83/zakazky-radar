"use client";

import { useState } from "react";
import { hashPassword } from "@/lib/crypto";
import { MB_LOGO } from "@/lib/logo";

// Odtlačok hesla pro USERS ve Vercelu. Počítá se jen v tomto prohlížeči, heslo se nikam neposílá,
// takže stránka může být veřejná (proxy.ts). Do USERS pak patří „jméno:odtlačok“ místo hesla.
export default function Heslo() {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const weak = pw.length > 0 && pw.length < 12;
  const entry = out ? `${name.trim() || "jmeno"}:${out}` : "";

  return (
    <main className="login">
      <form
        className="card login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setOut(await hashPassword(pw));
          setBusy(false);
        }}
      >
        <svg viewBox="0 0 456 312" width="52" height="36" aria-hidden="true">
          <path fill="var(--accent)" fillRule="evenodd" d={MB_LOGO} />
        </svg>
        <h1>Odtlačok hesla</h1>
        <p className="sub">
          Počítá se jen v tomto prohlížeči, heslo se nikam neposílá. Výsledek vlož do proměnné USERS ve Vercelu místo
          hesla – nikdo ho pak ve Vercelu nepřečte.
        </p>
        <label htmlFor="n">Jméno účtu</label>
        <input id="n" autoComplete="off" autoCapitalize="none" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="p">Nové heslo</label>
        <input id="p" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
        {weak && <p className="hint">Doporučuji aspoň 12 znaků (třeba tři slova a číslo).</p>}
        <label htmlFor="p2">Heslo znovu</label>
        <input id="p2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {pw2 && pw !== pw2 && <div className="warn">Hesla se liší.</div>}
        <button className="primary big" disabled={busy || !pw || pw !== pw2}>
          {busy ? "Počítám…" : "Vytvořit odtlačok"}
        </button>
        {entry && (
          <>
            <label>Položka do USERS</label>
            <code className="secret entry">{entry}</code>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(entry).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              {copied ? "Zkopírováno" : "Kopírovat"}
            </button>
            <p className="hint">
              Víc účtů odděl čárkou, např. marek:pbkdf2-sha256$…,michal:pbkdf2-sha256$… Pak ve Vercelu Redeploy.
            </p>
          </>
        )}
      </form>
    </main>
  );
}
