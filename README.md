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
| `AI_MODEL`, `AI_BUDGET_USD` | výchozí model (`opus`/`haiku`) a měsíční limit; jde změnit v Nastavení | ne |

Cron běží denně v 5:00 UTC (`vercel.json`). Bez databáze hlídá výchozí profil „CRM a zákaznické portály“.

## Lokálně
```bash
cp .env.example .env.local
npm install
npm run dev
```

## Verze
Číslo verze je v `package.json`, zobrazuje se v patičce a v Nastavení. Při každém vydání ho zvýšit a doplnit sem.

- **1.10** – zdroje ve dvou skupinách: Česká republika (vždy) a Slovenská republika (volitelně v Nastavení, zatím TED).
- **1.9.1** – výchozí model Haiku (do limitu 5 $ měsíčně), Opus jde zapnout v Nastavení.
- **1.9** – databáze pro poznámky, rozbory, nástěnku a skóre (Upstash), ranní e-mail i s blížícími se lhůtami
  a změnami, filtr kraj a hodnota (kraj určuje AI), hlídání změn u sledovaných zakázek, AI návrh nabídky
  (osnova a průvodní dopis), profil konkurenta (TED), útrata za AI s měsíčním limitem a volbou Opus / Haiku,
  Tender arena + eGORDION: všechny nové zakázky za 24 h jedním dotazem.
- **1.8** – Nastavení (ozubené kolo vpravo nahoře): světlý / tmavý / podle systému; číslo verze na webu.
- **1.7** – detail zakázky s AI rozborem, záložka Moje zakázky (přehled a nástěnka), paměť AI skóre.
- **1.6** – sběr profilů zadavatelů: oprava NEN, limit Tender areny, střídání po dnech.
- **1.5** – průběh hledání, řazení, export do Excelu a kalendáře, nové od minula.
- **1.4** – nový vzhled, zakázky ze všech profilů zadavatelů.
- **1.0–1.3** – MVP (TED, Hlídač, AI hodnocení), e-maily, průzkum trhu, NEN, logo.
