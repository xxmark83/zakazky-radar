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
| Tender arena + eGORDION – seznam nových za 24 h | všechny nové zakázky ~4 200 zadavatelů jedním dotazem denně | není potřeba |
| Vhodné uveřejnění – RSS nových zakázek | ~1 600 zadavatelů (hlavně obce); detail kvůli zadavateli a lhůtě (`scripts/vhodne.mjs`, z Macu – GitHub blokují) | není potřeba |
| **Otevřená data ISVZ** – isvz.nipez.cz/opendata | výsledky řízení (i podlimitní): vítěz, cena smlouvy, počet nabídek; měsíčně, jen IT, software, vzdělávání (`scripts/isvz.mjs`). Server z GitHubu neodpovídá, stahuje se z běžného počítače. | není potřeba |
| Hlídač státu – hlidacstatu.cz/api | doplňkově | token zdarma po registraci |
| **Dynamické nákupní systémy** – z otevřených dat ISVZ | DNS z IT a vzdělávání, do kterých se lze přidat kdykoli; ukazují se mezi zakázkami | není potřeba |
| **Registr smluv** – data.smlouvy.gov.cz | smlouvy z IT (i bez soutěže, nad 50 tis. Kč) pro průzkum trhu a profil konkurenta; denně (`scripts/smlouvy.mjs`) | není potřeba |
| TED – Slovensko (volitelně v Nastavení) | slovenské nadlimitní zakázky + výsledky | není potřeba |

### Jak se sbírají profily zadavatelů
Každý profil musí podle vyhlášky 345/2023 Sb. vydávat stejné XML (`<profil>/XMLdataVZ?od=…&do=…`).
- `data/profily-seznam.txt` – adresy všech profilů, vytažené z otevřených dat Registru veřejných zakázek
  (isvz.nipez.cz/opendata, pole `adresa_profilu`).
- `scripts/crawl.mjs` – projde profily a uloží otevřené zakázky do `data/profily.json`. Každý profil stahuje
  od svého posledního úspěchu (`data/profily-stav.json`), napřed ty s otevřenými zakázkami.
  Tender arena a eGORDION (stejné API) pustí asi 5 dotazů za minutu, proto se jejich ~3 300 profilů střídá
  po dnech; server, který vůbec neodpovídá, se v daném běhu přeskočí.
- GitHub Actions (`.github/workflows/crawl.yml`) ho spouští každý večer ve 22:17 UTC s limitem 5 hodin
  (veřejné repo nemá limit minut), takže data jsou hotová před ranním e-mailem;
  commit spustí nasazení na Vercelu.
  Ručně: GitHub → Actions → Sběr zakázek → Run workflow.

## Nastavení na Vercelu (Settings → Environment Variables)
| Proměnná | K čemu | Povinné |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI hodnocení | ano |
| `APP_PASSWORD` | heslo do aplikace | doporučeno |
| `OWNER_JMENO`, `USER_JMENO` | účty: hodnota = odtlačok z /heslo (nebo heslo), volitelně `:e-mail`; OWNER = vlastník (Správa účtů, dosavadní data) | volitelné |
| `AUTH_KEY` | dlouhý náhodný řetězec: šifruje klíče 2FA v databázi a podepisuje přihlášení (přístup k databázi pak nestačí) | doporučeno |
| `USERS` | starší zápis víc účtů v jedné proměnné: `jméno:odtlačok[:e-mail],…` (odtlačok z /heslo, případně heslo v čitelné podobě); první je vlastník (dosavadní data), nahrazuje `APP_PASSWORD` | volitelné |
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

- **1.29** – vlastník může vyžadovat 2FA (bez něj jen obrazovka nastavení), upozornění na nové přihlášení a zámek účtu
  (telefon a e-mail), zámek účtu po 5 chybách na 15 minut, nové ověření heslem pro citlivé kroky (10 minut),
  záznam událostí (Zabezpečení a Správa účtů), šifrování klíčů 2FA a podpis přihlášení přes AUTH_KEY;
  GitHub: Dependabot, automatické opravy, kontrola úniku klíčů.
- **1.28.1** – každý účet má vlastní proměnnou ve Vercelu (OWNER_MAREK, USER_MICHAL…), změna jednoho nevyžaduje znát
  heslo druhého; /heslo ukáže název proměnné i hodnotu; USERS funguje dál.
- **1.28** – zabezpečení: hesla v USERS jako odtlačky PBKDF2 (generátor na /heslo), podpis přihlášení tajným klíčem
  serveru, relace pro každé zařízení (seznam a odhlášení v Nastavení, platí okamžitě), dvoufázové ověření (TOTP,
  QR kód, 8 záložních kódů, vlastník ho umí kolegovi vypnout), bezpečnostní hlavičky (CSP, X-Frame-Options aj.).
- **1.27.1** – mobil: telefon na šířku má mobilní rozvržení, políčka 16 px (iPhone už stránku při psaní nepřiblíží).
- **1.27** – Správa účtů v Nastavení (jen vlastník): které oblasti smí ostatní hledat a jestli smí upravovat klíčová
  slova; kontroluje se i na serveru (hledání i ranní hlídání).
- **1.26** – více účtů (USERS): každý má vlastní přihlášení, zakázky, poznámky, sledování, nastavení, upozornění,
  kalendář i ranní e-mail; první uživatel si ponechává dosavadní data.
- **1.25.1** – Vhodné uveřejnění: ukončené zakázky si sběr pamatuje a nečte je při každém běhu znovu.
- **1.25** – širší rozvržení (až 1 440 px), na počítači „Co hledáš“ jako panel vlevo a výsledky vpravo, Dnes ve dvou
  sloupcích; nové písmo nadpisů (Bricolage Grotesque), jemný motiv radaru v pozadí, barevný proužek karty podle skóre,
  plynulé naskakování karet a plnění skóre.
- **1.24** – „Proč 92?“ po kliknutí na skóre, offline režim (poslední data bez signálu), detail na mobilu přes celou
  obrazovku se Zpět (i systémové Zpět), sledování konkurentů (výhry ráno v e-mailu a na telefonu), pondělní přehled
  týdne e-mailem, export podkladů nabídky do Wordu; Vhodné uveřejnění: externí zakázky bez opakovaného čtení detailu.
- **1.23** – AI rozbor čte zadávací dokumentaci (odkazy z XML profilu zadavatele nebo ze stránky zakázky; PDF celé,
  z Wordu text, ZIP rozbalí; jde i nahrát ručně), hodnoticí kritéria, checklist „co připravit“ s odškrtáváním,
  doporučená cena (předpokládaná hodnota, ceny podobných zakázek, vlastní výsledky), zápis výsledku po výhře či prohře.
- **1.22** – mobil: záložky dole u palce, potažení karty doprava = Zvažuji, doleva = Ne (s Vrátit); počítač: detail
  vedle seznamu na širokém displeji, klávesové zkratky (↑↓ J K, Enter, Z P N, /, ?).
- **1.21** – obrazovka Dnes (nové od minula, lhůty tento týden, změny, tipy AI, sledovaní zadavatelé), čára „nové od
  poslední návštěvy“ ve výsledcích, sledování zadavatele (každá jeho nová zakázka v e-mailu i na telefonu), upozornění
  na telefon (Web Push, klíče si appka vytvoří sama), kalendář lhůt k odběru (ICS s připomenutím 3 dny předem).
- **1.20** – v „Co hledáš“ jde vybrat víc oblastí najednou (i všechny tři), AI hodnotí podle té, která sedí;
  Hlídač státu: zakázky přes nové API v2 (/api/v2/vz/hledat), stará adresa vracela 404.
- **1.19.2** – naplánovaná úloha na Macu (`scripts/mac-sync.sh`, launchd každé 3 h): Vhodné uveřejnění a jednou
  měsíčně ISVZ, výsledky nahraje na GitHub. Vypnutí: `launchctl bootout gui/$(id -u)/cz.xxmark83.zakazky-radar`.
- **1.19.1** – Vhodné uveřejnění blokuje servery GitHubu, sběr z RSS běží z Macu; zakázky bez detailu jen 35 dní.
- **1.19** – Vhodné uveřejnění přes jejich RSS (každé 3 h, 30 s mezi dotazy) místo 1 600 profilů zvlášť, opravy adres
  profilů z registru (NEN, E-ZAK, e-zakazky), neaktivní profily E-ZAK se 30 dní přeskakují.
- **1.18** – PWA (ikona na plochu, celá obrazovka, rychlé spuštění), na mobilu po hledání sbalené volby a výsledky
  hned nahoře, filtry v panelu zdola, menší karta zakázky, rychlé skoky v detailu, v appce z plochy obnovení
  stažením dolů.
- **1.17.1** – historie zadavatele: stránkování a řazení Hlídače státu podle jejich dokumentace API.
- **1.17** – Historie zadavatele v detailu zakázky: smlouvy a zakázky za 5 let (Hlídač státu s HLIDAC_TOKEN,
  jinak naše IT smlouvy a ISVZ), IT a související s otevřenou zakázkou nahoře, IČO z ARES, tlačítko AI zhodnocení
  (současný dodavatel, ceny, proč smlouva souvisí).
- **1.16** – s databází mají mobil i počítač stejné i poslední výsledky hledání, vybranou volbu a „Co hledám“,
  filtry, řazení, vzhled a Nastavení (model, limit, Slovensko).
- **1.15** – vlastní přihlašovací stránka místo okna prohlížeče: heslo jednou na zařízení, pamatuje si 90 dní,
  odhlášení v Nastavení, nejvýš 10 pokusů za 15 minut, změna APP_PASSWORD odhlásí všechna zařízení.
- **1.14** – přehlednější vzhled: ikony v záložkách a u voleb, číslo rozpracovaných zakázek u Moje zakázky,
  souhrn hledání v dlaždicích, panel filtrů, který zůstává nahoře, karta zakázky s lhůtou vpravo nahoře
  a údaji s ikonami (zadavatel, hodnota, kraj), celá karta otevírá detail, barevné sloupce nástěnky.
- **1.13** – nová volba Kybernetická bezpečnost (GAP analýza NIS2, SIEM a SOC, endpoint, antivirus, EDR/XDR),
  krátké zkratky v průzkumu trhu jen jako celé slovo, Registr smluv sbírá i smlouvy z kyberbezpečnosti.
- **1.12** – dynamické nákupní systémy mezi zakázkami, Registr smluv v průzkumu trhu a profilu konkurenta,
  šetrný sběr z Vhodného uveřejnění (Crawl-Delay 30 s, opravené adresy).
- **1.11** – výsledky řízení z otevřených dat ISVZ v Průzkumu trhu a v profilu konkurenta (i malé zakázky, počet
  nabídek), kraj u TED z oficiálního kódu NUTS, veřejné repo a večerní sběr profilů až 5 hodin.
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
