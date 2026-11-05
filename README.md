# Zakázky radar

Stáhne české veřejné zakázky z bezplatných zdrojů a AI (Claude) ohodnotí 0–100,
jak sedí na moji nabídku (Kotva CRM, vzdělávací portál…).

## Záložky
- **Zakázky** – otevřené výzvy i připravované (předběžná oznámení, tržní konzultace); označím Zvažuji / Podám / Ne.
  AI skóre se pamatuje v prohlížeči podle textu „Co nabízím“, takže každé další hledání posílá AI jen nové zakázky.
- **Detail zakázky** – údaje, stav, poznámky, AI rozbor na tlačítko (podmínky, rizika, co nabídnout, dotazy
  na zadavatele; `/api/analyze` přečte i stránku zakázky) a ceny podobných zakázek podle CPV.
- **Moje zakázky** – přehled (nové za 7 dní, rozpracované, hodnota, úspěšnost, lhůty na 14 dní; kopírování a tisk do PDF)
  a nástěnka Nové tipy → Zvažuji → Připravuji → Podáno → Vyhráno / Nevyšlo. Poznámky a rozbory jsou v prohlížeči.
- **Průzkum trhu** – kdo a za kolik vyhrál podobné zakázky (medián ceny, rozpětí, nejčastější vítězové).
- **Hlídání e-mailem** – každé ráno nové vhodné zakázky (skóre 75+) e-mailem, bez duplicit.

## Zdroje dat (zdarma)
| Zdroj | Co pokrývá | Klíč |
|---|---|---|
| TED (EU) – api.ted.europa.eu | nadlimitní zakázky (cca od 3–5 mil. Kč) + výsledky | není potřeba |
| NEN – nen.nipez.cz | veřejný seznam zakázek (hledání v názvu) | není potřeba |
| **Profily zadavatelů** – všech cca 12 000 v ČR | kraje, města, obce, školy, nemocnice, státní firmy na Tender areně, eGORDIONu, E-ZAKu, Vhodném uveřejnění, NEN… vč. zakázek malého rozsahu | není potřeba |
| Hlídač státu – hlidacstatu.cz/api | doplňkově | token zdarma po registraci |

### Jak se sbírají profily zadavatelů
Každý profil musí podle vyhlášky 345/2023 Sb. vydávat stejné XML (`<profil>/XMLdataVZ?od=…&do=…`).
- `data/profily-seznam.txt` – adresy všech profilů, vytažené z otevřených dat Registru veřejných zakázek
  (isvz.nipez.cz/opendata, pole `adresa_profilu`).
- `scripts/crawl.mjs` – projde profily a uloží otevřené zakázky do `data/profily.json`. Každý profil stahuje
  od svého posledního úspěchu (`data/profily-stav.json`), napřed ty s otevřenými zakázkami.
  Tender arena a eGORDION (stejné API) pustí asi 5 dotazů za minutu, proto se jejich ~3 300 profilů střídá
  po dnech; server, který vůbec neodpovídá, se v daném běhu přeskočí.
- GitHub Actions (`.github/workflows/crawl.yml`) ho spouští každé ráno ve 3:17 UTC s limitem 45 minut;
  commit spustí nasazení na Vercelu.
  Ručně: GitHub → Actions → Sběr zakázek → Run workflow.

## Nastavení na Vercelu (Settings → Environment Variables)
| Proměnná | K čemu | Povinné |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI hodnocení | ano |
| `APP_PASSWORD` | heslo do aplikace | doporučeno |
| `HLIDAC_TOKEN` | podlimitní zakázky | ne |
| `CRON_SECRET` | ranní spouštění (libovolný dlouhý řetězec) | pro e-maily |
| `RESEND_API_KEY`, `ALERT_EMAIL` | odesílání e-mailu (resend.com, zdarma) | pro e-maily |
| Upstash Redis | Vercel → Storage → Upstash → Connect (nastaví `KV_REST_API_*` sám) | pro databázi |

Cron běží denně v 5:00 UTC (`vercel.json`). Bez databáze hlídá výchozí profil „CRM a zákaznické portály“.

## Lokálně
```bash
cp .env.example .env.local
npm install
npm run dev
```
