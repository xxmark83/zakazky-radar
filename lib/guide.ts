// Obrázkové návody k funkcím (jen pro správce). Snímky jsou v guide/*.jpg, zvýraznění v guide/boxes.json
// (x, y, šířka, výška v % snímku). Snímky se dělají skriptem proti lokální appce s ukázkovými daty.
export type GuideStep = { img: string; title: string; text: string; box?: number[] };
export type GuideChapter = { id: string; title: string; icon: string; intro: string; steps: GuideStep[] };

const s = (img: string, title: string, text: string): GuideStep => ({ img, title, text });

export const GUIDE: GuideChapter[] = [
  {
    id: "dnes",
    title: "Začni den: Dnes",
    icon: "home",
    intro: "Co je nového od minula a co hoří.",
    steps: [
      s("dnes-1", "Ranní přehled", "Záložka Dnes ukáže nahoře jedním řádkem stav dat (ťuknutím podrobnosti), pod ním nové zakázky od minula, lhůty tento týden, změny u sledovaných a nejlepší tipy."),
    ],
  },
  {
    id: "hledani",
    title: "Hledání zakázek",
    icon: "search",
    intro: "Výběr oblastí, hledání a AI skóre.",
    steps: [
      s("hledani-1", "Vyber, co hledáš", "V záložce Zakázky vlevo zaškrtni jednu nebo víc oblastí. Pod „Upravit, co hledám“ doladíš popis nabídky, klíčová slova a CPV kódy."),
      s("hledani-2", "Spusť hledání", "Klikni na Najít zakázky. Radar projde TED, NEN, profily zadavatelů a další zdroje, spojí duplicity a AI ohodnotí, co sedí. Jedna oblast trvá asi minutu, všechny najednou i tři."),
      s("hledani-3", "Nejlepší nahoře", "Číslo v kroužku je AI skóre 0–100 – jak dobře zakázka sedí na tvou nabídku, pod názvem je důvod. Štítek nad názvem říká, do které oblasti zakázka patří (i do víc najednou); „obecné IT“ znamená, že ji našlo jen obecné heslo nebo CPV. Nad seznamem filtruješ podle stavu, zdroje, kraje a lhůty."),
    ],
  },
  {
    id: "detail",
    title: "Detail zakázky",
    icon: "sparkle",
    intro: "Fakta, stav a zadávací podklady.",
    steps: [
      s("detail-1", "Základní fakta", "Klikni na kartu a otevře se detail: lhůta, hodnota, zveřejnění, AI skóre, výsledek posouzení a poslední den na dotazy zadavateli. Na telefonu je nahoře verdikt se lhůtou, hodnotou a šancí."),
      s("detail-2", "Stav zakázky", "Zvažuji, Připravuji, Podáno, Vyhráno, Nevyšlo nebo Ne. Stav zakázku přesune na nástěnku Moje zakázky a do kalendáře lhůt."),
      s("podklady-1", "Zadávací podklady", "Nepovinné: nahraj podklady jednou pro celou zakázku – PDF, Word, Excel nebo ZIP, i velké. Použije je Posouzení zakázky i Zeptej se dokumentace. Bez nich si AI dokumentaci najde sama."),
    ],
  },
  {
    id: "zvladneme",
    title: "Posouzení zakázky",
    icon: "shield",
    intro: "Jedno čtení dokumentace: co chtějí, kvalifikace, práce, cena a rizika.",
    steps: [
      s("zvladneme-1", "Rychlé posouzení, nebo důkladná kontrola", "Rychlé posouzení (Haiku, pár centů) na každou zajímavou zakázku. Když zvažuješ podání, Důkladná kontrola před podáním (Opus) – pečlivější. Samostatný AI rozbor už není, je součástí posouzení."),
      s("zvladneme-2", "Verdikt a kvalifikace", "Jeden verdikt Podat / S partnerem / Nepodávat, shrnutí, co zadavatel chce, a u každého kvalifikačního předpokladu stav. Obrat, pojištění a reference se počítají z čísel v Nastavení → Firma (řádek Výpočet z profilu)."),
      s("zvladneme-3", "Realizace a cena", "Rozpad díla na části s odhadem v člověkodnech a rizikem, technologie a termín. Pod tím, jestli zakázka při tvé denní sazbě cenově vyjde."),
      s("zvladneme-4", "Smluvní rizika a partneři", "Pokuty, záruky a další tvrdé podmínky ze smlouvy podle závažnosti. Když kvalifikaci sám nesplníš, uvidíš firmy, které podobné zakázky vyhrávají – ťuknutím jejich profil."),
      s("zvladneme-5", "Co nabídnout a co se přečetlo", "Další rizika, co nabídnout, hodnoticí kritéria a dotazy na zadavatele. Úplně dole je seznam přečtených dokumentů – když některý chybí, nahraj ho v Zadávacích podkladech a spusť posouzení znovu."),
    ],
  },
  {
    id: "nabidka",
    title: "Příprava nabídky",
    icon: "file",
    intro: "Co přiložit a návrh nabídky na míru.",
    steps: [
      s("detail-5", "Co připravit", "Seznam dokladů a příloh z posouzení zakázky. Odškrtávej, co máš hotové, vlastní položku přidáš dole."),
      s("detail-6", "Návrh nabídky", "Navrhnout: osnova nabídky a průvodní dopis na míru zakázce, s vybranými referencemi. Všechno stáhneš jedním souborem přes Stáhnout podklady do Wordu."),
    ],
  },
  {
    id: "firma",
    title: "Firma, reference a dokumenty",
    icon: "file",
    intro: "IČO z ARES, knihovna referencí, Word jedním klikem.",
    steps: [
      s("firma-1", "Firma z ARES", "Nastavení → Firma a reference: napiš IČO a klikni na Načíst z ARES. Doplní se název, sídlo a DIČ."),
      s("firma-2", "Doplň a ulož", "Doplň, kdo podepisuje, kontakty a čísla pro kvalifikaci: obrat za poslední roky, pojištění, denní sazbu, certifikace a tým. Podle nich Posouzení zakázky počítá. Pak Uložit firmu."),
      s("firma-3", "Přidej reference", "+ Přidat referenci: název projektu, objednatel, rok, cena a co jsi dodal. Čím konkrétnější popis, tím líp je AI vybere do návrhu nabídky."),
      s("firma-4", "Dokumenty jedním klikem", "V detailu zakázky stáhneš do Wordu krycí list, čestné prohlášení podle § 74 a seznam referencí. Když zadavatel přiložil vlastní formulář, použij jeho."),
    ],
  },
  {
    id: "ask",
    title: "Zeptej se dokumentace",
    icon: "chat",
    intro: "Otázky nad zadávací dokumentací s odkazem na stranu.",
    steps: [
      s("ask-1", "Polož otázku", "V detailu zakázky napiš otázku nebo klikni na hotový příklad. AI odpoví jen z dokumentace téhle zakázky."),
      s("ask-2", "Odpověď se zdrojem", "Pod odpovědí je dokument a strana, kde to stojí – před podáním si to ověř. Další otázky ke stejné zakázce jsou rychlejší a levnější."),
    ],
  },
  {
    id: "cena",
    title: "Cena, šance a konkurence",
    icon: "chart",
    intro: "Za kolik podat a jakou máš šanci.",
    steps: [
      s("cena-1", "Porovnat s podobnými", "V detailu v části Cena, šance a konkurence klikni na Porovnat. Radar vezme výsledky z ISVZ, TED a Registru smluv."),
      s("cena-2", "Cena, šance a kdo vyhrával", "Doporučená cena, odhad šance na výhru s důvody a nejčastější vítězové podobných zakázek – klikem na jméno profil konkurenta."),
    ],
  },
  {
    id: "moje",
    title: "Moje zakázky",
    icon: "board",
    intro: "Nástěnka rozpracovaných zakázek.",
    steps: [
      s("moje-1", "Nástěnka", "Každá zakázka se stavem je tady. Přetáhni kartu do dalšího sloupce, jak postupuješ. Nahoře jsou lhůty v příštích 14 dnech a souhrn výsledků."),
    ],
  },
  {
    id: "lhuty",
    title: "Lhůty, kalendář a telefon",
    icon: "calendar",
    intro: "Ať ti neuteče lhůta ani den na dotazy.",
    steps: [
      s("lhuty-1", "Dotazy do", "Poslední den na dotazy zadavateli: přesně z Posouzení zakázky, jinak odhad 8 pracovních dní před lhůtou (označený „odhad“)."),
      s("lhuty-2", "Kalendář lhůt", "Nastavení → Kalendář lhůt: zkopíruj odkaz a přidej ho do Google nebo Apple Kalendáře. Lhůty i dotazy se doplňují samy, s připomínkou předem."),
      s("lhuty-3", "Upozornění na telefon", "Zapni upozornění: telefon pípne u nových top zakázek, blížící se lhůty a 2 dny před koncem lhůty na dotazy. Na iPhonu nejdřív přidej appku na plochu."),
    ],
  },
  {
    id: "rano",
    title: "Ranní e-mail a AI",
    icon: "mail",
    intro: "Útrata, model a ranní posouzení s verdiktem.",
    steps: [
      s("rano-1", "Limit a model", "Nastavení → AI a útrata: kolik jsi tento měsíc utratil, model (Haiku levný, Opus přesnější) a měsíční limit, přes který appka nepůjde."),
      s("rano-2", "Ranní posouzení", "Zvol 1–3 zakázky denně: ráno AI přečte dokumentaci nejlepších nových zakázek a verdikt Podat / S partnerem / Nepodávat najdeš rovnou v ranním e-mailu i v detailu zakázky."),
    ],
  },
  {
    id: "hlidani",
    title: "Hlídání",
    icon: "bell",
    intro: "Profily, zadavatelé, konkurenti a smlouvy.",
    steps: [
      s("hlidani-1", "Hlídat profil", "V záložce Hlídání → Profily ulož aktuální výběr z Co hledáš. Nové zakázky z něj ti každé ráno přijdou e-mailem."),
      s("hlidani-0", "Sledovat zadavatele", "V detailu zakázky klikni na Sledovat zadavatele. Jeho nové zakázky uvidíš na Dnes a v e-mailu."),
      s("hlidani-2", "Sledovaní zadavatelé", "Záložka Zadavatelé: přehled všech sledovaných s počtem otevřených zakázek. Sledované konkurenty najdeš ve vedlejší záložce, přidáš je z Průzkumu trhu."),
      s("hlidani-3", "Smlouvy subjektů", "Záložka Smlouvy: napiš IČO nebo název, klikni na Vyhledat a u nalezeného subjektu na Sledovat. Každé ráno se zkontroluje Registr smluv. U každého zvolíš Vše, nebo jen tvoje oblasti, a nad seznamem období od 45 dní po 2 roky."),
    ],
  },
  {
    id: "trh",
    title: "Průzkum trhu a konkurence",
    icon: "chart",
    intro: "Kdo vyhrává, za kolik a kde.",
    steps: [
      s("trh-1", "Období a kraj", "V Průzkumu trhu zvol období, kraj a zdroj a klikni na Spustit průzkum."),
      s("trh-2", "Čísla trhu", "Kolik zakázek se zadalo, medián a typické rozpětí cen a průměrný počet nabídek."),
      s("trh-3", "Kdo vyhrává", "Nejčastější vítězové s počtem výher, průměrnou cenou a celkovým objemem. Klikni na jméno pro detail."),
      s("trh-4", "Detail konkurenta", "Výhry po letech, pro koho dodává nejčastěji a poslední výhry. Tady ho přidáš mezi sledované."),
    ],
  },
  {
    id: "ucty",
    title: "Zabezpečení a účty",
    icon: "shield",
    intro: "2FA, zařízení a správa Michalova účtu.",
    steps: [
      s("ucty-1", "Dvoufázové ověření", "Nastavení → Zabezpečení: zapni 2FA a ulož si záložní kódy. Pod tím vidíš přihlášená zařízení a můžeš je odhlásit."),
      s("ucty-2", "Správa účtů", "Jen pro správce: u dalších účtů určíš, které oblasti smí hledat, jestli je smí upravovat a jestli musí mít 2FA. AUTH_KEY ve Vercelu nikdy neměň."),
    ],
  },
];
