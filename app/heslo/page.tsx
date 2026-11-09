"use client";

import { useState } from "react";
import { hashPassword } from "@/lib/crypto";
import { MB_LOGO } from "@/lib/logo";

// Odtlačok hesla pro proměnnou účtu ve Vercelu (OWNER_JMENO nebo USER_JMENO, lib/users.ts).
// Počítá se jen v tomto prohlížeči, heslo se nikam neposílá, takže stránka může být veřejná (proxy.ts).
export default function Heslo() {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState(false);
  const [copied, setCopied] = useState("");
  const weak = pw.length > 0 && pw.length < 12;
  // název proměnné: jen písmena bez diakritiky, číslice a podtržítko
  const varName = `${owner ? "OWNER" : "USER"}_${
    name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase() || "JMENO"
  }`;
  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    });

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
          Počítá se jen v tomto prohlížeči, heslo se nikam neposílá. Výsledek vlož ve Vercelu do proměnné svého účtu
          místo hesla – nikdo ho pak ve Vercelu nepřečte.
        </p>
        <label htmlFor="n">Jméno účtu</label>
        <input id="n" autoComplete="off" autoCapitalize="none" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="check-row">
          <input type="checkbox" checked={owner} onChange={(e) => setOwner(e.target.checked)} />
          <span>Vlastník (Správa účtů, jen jeden účet)</span>
        </label>
        <label htmlFor="p">Nové heslo</label>
        <input id="p" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
        {weak && <p className="hint">Doporučuji aspoň 12 znaků (třeba tři slova a číslo).</p>}
        <label htmlFor="p2">Heslo znovu</label>
        <input id="p2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {pw2 && pw !== pw2 && <div className="warn">Hesla se liší.</div>}
        <button className="primary big" disabled={busy || !pw || pw !== pw2}>
          {busy ? "Počítám…" : "Vytvořit odtlačok"}
        </button>
        {out && (
          <>
            <label>Název proměnné ve Vercelu</label>
            <code className="secret entry">{varName}</code>
            <button type="button" onClick={() => copy(varName, "name")}>
              {copied === "name" ? "Zkopírováno" : "Kopírovat název"}
            </button>
            <label>Hodnota (odtlačok)</label>
            <code className="secret entry">{out}</code>
            <button type="button" onClick={() => copy(out, "value")}>
              {copied === "value" ? "Zkopírováno" : "Kopírovat hodnotu"}
            </button>
            <p className="hint">
              Vercel → Settings → Environment Variables → Add: název a hodnotu výše, prostředí Production, Save, pak
              Redeploy. Ranní e-mail: na konec hodnoty přidej :tvuj@email.cz
            </p>
          </>
        )}
      </form>
    </main>
  );
}
