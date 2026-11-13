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

- **1.53.0** – spolehlivost rozhodování: (1) zakázka se stejným názvem a zadavatelem, ale jiným evidenčním číslem na témže profilu (znovu vyhlášené řízení) je samostatná zakázka – nepřevezme staré „Ne“, skóre ani „už odesláno e-mailem“; na kartě má štítek „víc řízení“ a v detailu odkaz na druhé číslo. Dřív spojená řízení se rozdělí, stav si nechá to starší. (2) Posouzení: prázdná knihovna referencí nebo reference bez ceny či roku dává „nejasné – doplň“, ne „nesplněno → podat s partnerem“. (3) AI skóre se přepočítá, když zakázka po prvním hodnocení dostane znatelně bohatší popis, hodnotu nebo CPV. (4) Měsíční limit za AI hlídá server u hledání, ranního běhu, posouzení, rozboru i dotazů. (5) Produkce bez nastavených účtů se zamkne místo otevření. (6) První automatické testy (`npm test`) a kontrola v GitHub Actions při každé změně kódu.
- **1.52.0** – nová oblast hledání **MM security** (penetrační testy webových, mobilních a desktopových aplikací, infrastruktury a API, revize zdrojového kódu) a štítky oblastí na každé zakázce: karta i detail ukazují, do které oblasti zakázka patří podle klíčových slov (i do víc najednou), „obecné IT“ = našlo ji jen obecné heslo nebo CPV. Štítek jde hledat v poli nad seznamem a je i v exportu do Excelu. Přesnější slova: „penetrační“ platí jen s „test…“ (ne penetrační nátěry), „mobilní“ jen s „aplikace“ (ne telefony). NEN se při více oblastech ptá až na 50 slov místo 24 (dřív se slova posledních oblastí vůbec nehledala), časový limit 150 s.
- **1.51.0** – NEN při živém hledání čte všechny otevřené zakázky na slovo, ne jen prvních 100 řádků: ptá se rovnou s filtrem na stav „Neukončen“ a projde všechny stránky (dřív byla otevřená jen zhruba každá čtvrtá z načtených a u častých slov se na starší otevřené nedostalo). Dotazy mají rozestup a při 503 nebo výpadku spojení se opakují, takže slovo tiše nevypadne; hledání je přitom rychlejší (4 oblasti kolem minuty místo 3–4). Otevřené zakázky bez lhůty z minulých let se neberou (v NEN jich visí stovky neuzavřených). Návody v Nastavení: všechny snímky znovu v aktuálním vzhledu, AI rozbor už není samostatný krok – Posouzení zakázky má 5 kroků (kvalifikace s výpočtem z profilu, realizace a cena, smluvní rizika a partneři, přečtené dokumenty), nová kapitola Příprava nabídky, Hlídání podle záložek a volby období smluv. `scripts/guide-shots.cjs` umí nové rozložení (záložky Nastavení a Hlídání).
- **1.50.0** – smlouvy sledovaných subjektů fungují i bez Hlídače státu: když jeho API neodpoví (vyčerpaný přístup, chybí token), berou se IT smlouvy z vlastních dat Registru smluv (každé ráno z otevřených dat); appka to u přehledu řekne
- **1.49.0** – klíčová slova oblastí doplněná podle dat (2 roky IT zakázek): web, webu, internetové stránky, redakční systém, CMS, elektronizace, servicedesk, agendový systém, kyber, NÚKIB, dvoufaktorové, vícefaktorové, autentizace, phishing, elearning, moodle; „webové stránky“ najdou i „webových stránek“; uložená hledání a hlídání se starými slovy přejdou na nová sama (ručně upravená zůstanou); Hlídač státu: hesla jdou spojená po deseti (6–12 dotazů na hledání místo až 120) a odpověď se drží 6 hodin
- **1.48.0** – jedno Posouzení zakázky místo dvou nástrojů: AI rozbor (co chtějí, rizika, co nabídnout, hodnoticí kritéria, co přiložit) je součástí posouzení – jedno čtení dokumentace, jeden verdikt, zhruba poloviční cena; ranní běh dělá u nejlepších zakázek jedno posouzení; oprava: posouzení zakázky ve skutečnosti nikdy neproběhlo, knihovna požadavek s limitem 24 000 tokenů odmítla ještě před odesláním – dlouhé odpovědi se teď přenášejí průběžně
- **1.47.0** – „Zvládneme to?“ se nově jmenuje Posouzení zakázky a je kompletní: kontrola ceny (odhad člověkodní × denní sazba z profilu proti předpokládané hodnotě), smluvní rizika (pokuty, záruka, SLA, zdrojový kód) jako vlastní část, návrh partnerů z firem, které podobné zakázky vyhrávají, položky „doložit“ jdou rovnou do seznamu Co připravit do nabídky, upozornění, když se zakázka od posouzení změnila; ranní běh udělá u nejlepších zakázek i rychlé posouzení a na kartě je vidět „1× nesplněno“ nebo „cenově nevychází“ dřív, než ji otevřeš; seznam se dělí na Sedí (75+) a sbalené Možná sedí; v detailu na telefonu je nahoře verdikt a tři čísla (lhůta, hodnota, šance); zakázky z E-ZAKu mají přímý odkaz na zakázku místo profilu zadavatele, Tender arena ho dostane z rychlého seznamu při dalším sběru; smlouvy sledovaných subjektů: jde přestat sledovat i starší záznam bez IČO (dřív tlačítko nedělalo nic) a období nalezených smluv se volí (45 dní až 2 roky)
- **1.46.0** – stav dat nahoře a víc profilů: na obrazovce Dnes je nahoře jeden řádek se stavem dat (čerstvá / právě se stahují / pozor, stará data – červeně), celý přehled se rozbalí ťuknutím; sběr profilů opravuje chybné adresy z registru: vrací se 30 profilů eveza.cz (pravidlo pro e-zakazky.cz je od 6. 11. omylem vyřazovalo), nově 32 profilů Tender areny (adresa „/profil/…“ místo „/profily/…“, s „#/“ nebo s připojenou zakázkou), 46 profilů profilzadavatele.cz a NEN s překlepem v doméně; ve stavu dat už nestojí, že profily „neodpovídají“, když mají v registru chybnou adresu
- **1.45.2** – iPhone: záložky jsou zase dole (v běžném tmavém a světlém vzhledu je Safari lepilo nahoru přes logo a Nastavení)
- **1.45.1** – výchozí vzhled je Vesmír tmavý (kdo si vzhled vybral dřív, tomu zůstává; „Podle systému“ jde dál zvolit v Nastavení)
- **1.45.0** – Zvládneme to? počítá místo odhadu: ve firemním profilu nová pole (obrat za 3 roky, limit pojištění, certifikáty s platností, tým) a u každého požadavku na obrat, pojištění a reference je „Výpočet z profilu“ – co zadavatel chce, co máš a jak to vyšlo; reference se párují s požadavkem (obsah vybere AI, hodnotu a stáří ověří výpočet) a výpočet má přednost před odhadem AI; u výsledku je vidět „Přečteno X z Y dokumentů“ a proč se zbytek nepřečetl; oprava: dokumenty z Tender areny se vůbec nečetly (server před soubor vkládá kus HTML), názvy souborů ze ZIPu jsou čitelné (CP852), vzory čestných prohlášení nezabírají místo zadávací dokumentaci, při omezení stahování se zkusí znovu
- **1.44.0** – telefon a hustý seznam: karty zakázek jsou na telefonu kompaktní (3–4 na obrazovku místo jedné; stav se mění potažením, ťuknutí otevře detail), v detailu je dole u palce lišta Zvažuji / Podám / Ne a odkaz na zakázku, obrazovka Dnes ukazuje jen to, co něco znamená; upozornění na telefonu otevře rovnou detail zakázky (dřív jen úvodní stránku); ve vzhledu Vesmír už spodní záložky, horní lišta a lišta filtrů nejsou průhledné (text pod nimi prosvítal); na počítači přepínač Řádky / Karty – hustý seznam s 12 zakázkami na obrazovku
- **1.43.0** – hledání bez úniků a duplicit: při více oblastech najednou se už neztrácejí hesla (limit 24 slov platí jen pro NEN, ne pro stažená data), hledá se bez diakritiky a krátké zkratky (SOC, EDR, SIEM) jen jako celé slovo; Hlídač státu hledá všechna hesla (dřív prvních 8) a víc stránek; TED hledá vedle CPV i podle hesel v textu a při 429 zkusí dotaz znovu; ranní e-mail hlídá 30 dní zpět, takže neunikne zakázka z profilu staženého se zpožděním; když AI zakázku nevrátí nebo dávka selže, zakázka zůstane nehodnocená a zkusí se příště (dřív dostala natrvalo 0, nebo spadlo celé hledání); stejná zakázka z více zdrojů se spojí do jedné s nejúplnějšími údaji a drží si stálé id (stav, AI skóre i „už posláno e-mailem“ se neztrácí); sběr profilů nestahuje zdvojené adresy (http/https), odklízí staré záznamy bez lhůty a rychlé záznamy Tender areny, jakmile je zakázka i z profilu; NEN naživo má časový limit
- **1.42.0** – přestavba pro rychlou orientaci: detail zakázky ve třech fázích (1 Rozhodnout: podklady, Zvládneme to?, dotazy, cena a šance; 2 Připravit nabídku: rozbor, checklist, dokumenty, návrh, Word; 3 Souvislosti: historie zadavatele, popis, poznámky), verdikt Zvládneme to? v přehledu nahoře, stav hned pod ním, v liště jedno hlavní tlačítko „další krok“ (posoudit → rozbor → návrh → podklady); Dnes začíná „Co dnes udělat“ (lhůty, dotazy na zadavatele a změny do týdne, podle data), počty jako čipy, stav dat dole a sbalený, když je vše v pořádku; Nastavení ve 4 záložkách (Firma, Upozornění, AI a data, Účet); Hlídání ve 4 záložkách (Profily, Zadavatelé, Konkurenti, Smlouvy) s počty; na kartách ve výsledcích i na nástěnce řádek „Posouzeno … → další krok“ a blížící se dotazy.
- **1.41.2** – návody: nové snímky Zadávací podklady, Zvládneme to? (3 kroky), AI rozbor a Cena, šance a konkurence.
- **1.41.1** – návody vynechají kroky, ke kterým ještě není snímek.
- **1.41.0** – Nastavení → Vzhled: „Vesmír tmavý“ a „Vesmír světlý“ (černá noc s hvězdami / světlá obrácená verze, bílý akcent, Big Shoulders verzálky v nadpisech a Public Sans v textu – písma uložená v appce přes @fontsource, tlačítka jako pilulky, plochy oddělené čárou, bez stínů a gradientů, barva jen pro význam). Návody: nová kapitola Zvládneme to?, texty podle úklidu 1.40.
- **1.40.0** – úklid duplicit: (1) jedna sekce „Cena, šance a konkurence“ místo dvou cenových; (2+4) „Zadávací podklady“ se nahrají jednou pro celou zakázku a použijí je AI rozbor, Zvládneme to? i Zeptej se dokumentace (staré nahrávání do 4 MB zrušeno), stažená dokumentace z portálu se 30 min drží v paměti serveru, citace z nahraného textu ukazují stranu; (3) AI rozbor bez vlastního verdiktu, podmínek a dotazů – rozhodnutí je jen ve Zvládneme to? (rozbor ukáže předběžný dojem), Word bere kvalifikaci ze Zvládneme to?; (5) stav e-mailu jen v Nastavení → E-mailová upozornění, oprava: e-mail se počítá i z OWNER_/USER_ …:e-mail; (6) v Nastavení už není duplicitní přehled dat (je na Dnes), zůstává Stáhnout všechno znovu; (7) odstraněno staré přidávání subjektů bez vyhledání.
- **1.39.1** – „Zvládneme to?“: dvě pojmenované volby s popisem – Rychlé posouzení (Haiku) a Důkladná kontrola před podáním (Opus, doporučí se po kladném rychlém posouzení); vytažený text podkladů se pamatuje, kontrola nečte soubory znovu; u výsledku je vidět, která z nich to byla.
- **1.39.0** – „Zvládneme to?“ v detailu zakázky: nahrání všech zadávacích podkladů (PDF, Word, Excel, OpenDocument, ZIP, i velké – text se vytáhne v prohlížeči přes pdf.js, soubory se nikam neukládají), AI (Haiku/Opus) vypíše všechny kvalifikační předpoklady se stavem splněno / doložit / nesplněno / nejasné proti firemnímu profilu a referencím, odhad realizace po částech v člověkodnech, technologie, termín, co chybí, co doplnit do profilu, dotazy na zadavatele (`/api/assess`, `lib/assess.ts`, `lib/extract.ts`). Firemní profil má nové pole „Co umíš a čím disponuješ“. pdfjs-dist 6.5 (opravená zranitelnost).
- **1.38.1** – Dnes: místo krátkého pruhu plný Stav dat (stejné karty jako v Nastavení: počty, ukazatel doplnění, co zbývá, kdy příště, právě běžící stahování na GitHubu i Macu s ukazatelem).
- **1.38.0** – na obrazovce Dnes stálý pruh „Data“: co se právě stahuje (GitHub, Mac), kdy se který zdroj naposledy doplnil, zpožděné zdroje červeně; klik otevře Nastavení se Stavem dat.
- **1.37.0** – Smlouvy sledovaných subjektů ve dvou krocích: „Vyhledat“ (ARES, u názvu až 6 kandidátů s IČO a adresou, nic se neukládá) → „Sledovat“ u vybraného subjektu. Oprava rozložení tlačítka „Hlídat aktuální profil“.
- **1.36.2** – Hlídač státu (chyba 429 = příliš mnoho dotazů): všechny dotazy jdou přes jednu frontu (`lib/hlidac-api.ts`, ~3 za sekundu, při 429 čeká podle Retry-After a zkusí znovu), odpovědi se drží v Redisu (hledání 1 h, hlídání 3 h, historie zadavatele 12 h); srozumitelná hláška v historii zadavatele.
- **1.36.1** – průběh hledání ukazuje u každého zdroje „naživo“ / „staženo“ a text chyby; Hlídač státu: pauza mezi dotazy, jeden opakovaný pokus při 429, poctivý User-Agent.
- **1.36.0** – Nastavení → Stav dat → „Stáhnout všechno znovu“ (jen správce, dvojí potvrzení + nové ověření heslem, nejvýš jednou za 6 h): spustí na GitHubu plný sběr profilů (120 dní) a Registr smluv za 3 měsíce a zapíše `data/refresh-request.json` pro Mac, který při dalším běhu projde celé Vhodné uveřejnění (35 dní) a ISVZ za 3 měsíce (`data/refresh-done.json`). Potřebuje `GH_DISPATCH_TOKEN` ve Vercelu (fine-grained, jen toto repo, Actions + Contents: Read and write).
- **1.35.0** – Nastavení → Stav dat: co je stažené (profily, Vhodné uveřejnění, ISVZ, DNS, Registr smluv), kdy se to doplnilo, co ještě zbývá, kdy příště a co se právě stahuje na GitHubu (živě). E-mailová upozornění: na jakou adresu chodí, odesílatel, záznam posledního ranního běhu a zkušební e-mail (`/api/datastatus`).
- **1.34.0** – průběh hledání naživo (`/api/search?stream=1`): který zdroj je hotový a s kolika zakázkami, AI dávky, procenta a plovoucí ukazatel. Oprava lhůt: dny se počítají podle kalendáře v místním čase (včerejší lhůta už není „končí dnes“, ale „lhůta uplynula“), uložené výsledky s prošlou lhůtou se nezobrazují, nově „končí zítra“.
- **1.33.0** – Návody k funkcím v Nastavení: 12 obrázkových videí krok za krokem (přiblížení, zvýraznění, automatické přehrávání, šipky a mezerník), jen pro správce – snímky v `guide/`, vydává je `/api/guide` jen vlastníkovi. Nové snímky: `node scripts/guide-shots.cjs` (popis v souboru).
- **1.32.0** – Firma a reference (IČO → ARES, knihovna referencí), krycí list, čestné prohlášení (§ 74) a seznam referencí do Wordu jedním klikem, AI vybírá reference do návrhu nabídky, „Zeptej se dokumentace“ s odkazem na stranu, lhůta na dotazy v detailu, kalendáři a push 2 dny předem, ranní AI rozbor nejlepších zakázek s verdiktem v e-mailu, odhad šance na výhru, průzkum trhu podle kraje s průměrnou cenou vítěze.
- **1.31.1** – útrata za AI počítá i vyšší cenu Haiku 5.5 u vstupu nad 100 tis. tokenů (velká dokumentace).
- **1.31** – smlouvy sledovaných subjektů: jedno políčko na IČO nebo názvy (ARES), každé ráno nové uzavřené smlouvy
  z Registru smluv přes Hlídač státu (objednatel i dodavatel), u každého subjektu „vše“ nebo jen vybrané oblasti,
  e-mail, telefon, přehled v Hlídání a na Dnes, tlačítko „Zkontrolovat teď“.
- **1.30** – nová oblast „Zakázky na míru (živnost)“: aplikace, evidence, portály, rezervace, weby, dashboardy a chatboty
  do 2 mil. Kč (sama nastaví filtr hodnoty), štítek „malý rozsah“ u zakázek malého rozsahu a do 2 mil. Kč.
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
