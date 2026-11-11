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
      s("dnes-1", "Ranní přehled", "Záložka Dnes ukáže stav dat (co se právě stahuje a kdy se co doplnilo), nové zakázky od minula, lhůty tento týden, změny u sledovaných a nejlepší tipy."),
    ],
  },
  {
    id: "hledani",
    title: "Hledání zakázek",
    icon: "search",
    intro: "Výběr oblastí, hledání a AI skóre.",
    steps: [
      s("hledani-1", "Vyber, co hledáš", "V záložce Zakázky vlevo zaškrtni jednu nebo víc oblastí. Pod „Upravit, co hledám“ doladíš popis nabídky, klíčová slova a CPV kódy."),
      s("hledani-2", "Spusť hledání", "Klikni na Najít zakázky. Radar projde TED, NEN, profily zadavatelů a dynamické nákupní systémy a AI ohodnotí, co sedí. Trvá to asi minutu."),
      s("hledani-3", "Nejlepší nahoře", "Číslo v kroužku je AI skóre 0–100 – jak dobře zakázka sedí na tvou nabídku, pod názvem je důvod. Nad seznamem filtruješ podle stavu, zdroje, kraje a lhůty."),
    ],
  },
  {
    id: "detail",
    title: "Detail a AI rozbor",
    icon: "sparkle",
    intro: "Fakta, stav, rozbor dokumentace a návrh nabídky.",
    steps: [
      s("detail-1", "Základní fakta", "Klikni na kartu a otevře se detail: lhůta, hodnota, zveřejnění, AI skóre a poslední den na dotazy zadavateli."),
      s("detail-2", "Stav zakázky", "Zvažuji, Připravuji, Podáno, Vyhráno, Nevyšlo nebo Ne. Stav zakázku přesune na nástěnku Moje zakázky a do kalendáře lhůt."),
      s("podklady-1", "Zadávací podklady", "Nepovinné: nahraj podklady jednou pro celou zakázku – PDF, Word, Excel nebo ZIP, i velké. Použije je rozbor, Zvládneme to? i Zeptej se dokumentace. Bez nich si AI dokumentaci najde sama."),
      s("detail-3", "Udělat rozbor", "AI přečte podklady a řekne, co zadavatel chce. Stojí jednotky centů."),
      s("detail-4", "Co v rozboru najdeš", "Shrnutí, rizika, co nabídnout a hodnoticí kritéria. Předběžný dojem je jen orientační – o podání rozhoduje Zvládneme to?."),
      s("detail-5", "Co připravit", "Checklist dokladů a příloh z dokumentace. Odškrtávej, co máš hotové, vlastní položku přidáš dole."),
      s("detail-6", "Návrh nabídky", "Navrhnout: osnova nabídky a průvodní dopis na míru zakázce, s vybranými referencemi. Všechno stáhneš jedním souborem přes Stáhnout podklady do Wordu."),
    ],
  },
  {
    id: "zvladneme",
    title: "Zvládneme to?",
    icon: "shield",
    intro: "Kvalifikace proti tvé firmě a odhad, jestli to naprogramujete.",
    steps: [
      s("zvladneme-1", "Rychlé posouzení, nebo důkladná kontrola", "Rychlé posouzení (Haiku, pár centů) na každou zajímavou zakázku. Když zvažuješ podání, Důkladná kontrola před podáním (Opus) – pečlivější."),
      s("zvladneme-2", "Verdikt a kvalifikace", "Jeden verdikt Podat / S partnerem / Nepodávat a u každého kvalifikačního předpokladu stav: splněno, doložit, nesplněno nebo nejasné – i s tím, jak to vyřešit."),
      s("zvladneme-3", "Realizace", "Rozpad díla na části s odhadem v člověkodnech a rizikem, součet, technologie a jestli se to vejde do termínu."),
    ],
  },
  {
    id: "firma",
    title: "Firma, reference a dokumenty",
    icon: "file",
    intro: "IČO z ARES, knihovna referencí, Word jedním klikem.",
    steps: [
      s("firma-1", "Firma z ARES", "Nastavení → Firma a reference: napiš IČO a klikni na Načíst z ARES. Doplní se název, sídlo a DIČ."),
      s("firma-2", "Doplň a ulož", "Doplň, kdo podepisuje, funkci, e-mail, telefon a bankovní spojení. Pak Uložit firmu."),
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
      s("lhuty-1", "Dotazy do", "Poslední den na dotazy zadavateli: přesně z AI rozboru, jinak odhad 8 pracovních dní před lhůtou (označený „odhad“)."),
      s("lhuty-2", "Kalendář lhůt", "Nastavení → Kalendář lhůt: zkopíruj odkaz a přidej ho do Google nebo Apple Kalendáře. Lhůty i dotazy se doplňují samy, s připomínkou předem."),
      s("lhuty-3", "Upozornění na telefon", "Zapni upozornění: telefon pípne u nových top zakázek, blížící se lhůty a 2 dny před koncem lhůty na dotazy. Na iPhonu nejdřív přidej appku na plochu."),
    ],
  },
  {
    id: "rano",
    title: "Ranní e-mail a AI",
    icon: "mail",
    intro: "Útrata, model a ranní rozbor s verdiktem.",
    steps: [
      s("rano-1", "Limit a model", "Nastavení → AI a útrata: kolik jsi tento měsíc utratil, model (Haiku levný, Opus přesnější) a měsíční limit, přes který appka nepůjde."),
      s("rano-2", "Ranní rozbor", "Zvol 1–3 zakázky denně: ráno AI přečte dokumentaci nejlepších nových zakázek a verdikt Podat / Zvážit / Nechat být najdeš rovnou v ranním e-mailu."),
    ],
  },
  {
    id: "hlidani",
    title: "Hlídání",
    icon: "bell",
    intro: "Profily, zadavatelé, konkurenti a smlouvy.",
    steps: [
      s("hlidani-1", "Hlídat profil", "V záložce Hlídání ulož aktuální výběr z Co hledáš. Nové zakázky z něj ti každé ráno přijdou e-mailem."),
      s("hlidani-0", "Sledovat zadavatele", "V detailu zakázky klikni na Sledovat zadavatele. Jeho nové zakázky uvidíš na Dnes a v e-mailu."),
      s("hlidani-2", "Sledovaní zadavatelé", "Přehled všech sledovaných s počtem otevřených zakázek. Pod tím jsou sledovaní konkurenti, ty přidáš z Průzkumu trhu."),
      s("hlidani-3", "Smlouvy subjektů", "Napiš IČO nebo názvy a klikni na Sledovat. Každé ráno se zkontroluje Registr smluv. U každého zvolíš Vše, nebo jen tvoje oblasti."),
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
