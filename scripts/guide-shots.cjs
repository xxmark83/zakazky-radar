// Snímky pro návody (guide/*.jpg + guide/boxes.json). Spouští se ručně proti lokální appce:
// 1) lokální Redis (nebo fake) + `npm run build && OWNER_MAREK=<testovací heslo> USER_MICHAL=<testovací heslo> npx next start -p 3468`
// 2) `npm i --no-save playwright` a `node scripts/guide-shots.cjs guide [jen-předpona]`
// AI odpovědi (skóre, posouzení, dotazy) jsou jen ukázkové – lokálně není klíč k AI. Přihlašovací heslo bere z GUIDE_PASSWORD.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2];
const ONLY = process.argv[3];
const B = 'http://localhost:3468';
const W = 1280, H = 800;
const boxes = fs.existsSync(OUT + '/boxes.json') ? JSON.parse(fs.readFileSync(OUT + '/boxes.json')) : {};

const KW = ['portál','portal','crm','e-learning','elearning','vzděláv','školení','kyber','bezpečnost','nis','siem','software','aplikac','informační systém','webov','helpdesk','digitál','licenc','vývoj'];
function fakeScore(t) {
  const s = (t.title + ' ' + t.description).toLowerCase();
  const hits = KW.filter((k) => s.includes(k)).length;
  let h = 0; for (const c of t.id) h = (h * 31 + c.charCodeAt(0)) % 997;
  const score = Math.min(94, (hits ? 62 + hits * 9 : 30) + (h % 9));
  const product = /kyber|bezpečn|nis|siem/.test(s) ? 'Kybernetická bezpečnost' : /vzděl|škol|learning/.test(s) ? 'Vzdělávací portál' : /crm|portál|portal|helpdesk/.test(s) ? 'CRM a zákaznické portály' : 'Zakázky na míru (živnost)';
  return { score, product, reason: score >= 70 ? `Zadavatel hledá řešení, které pokryješ produktem ${product}; rozsah odpovídá malé firmě.` : 'Spíš okrajově – hlavní část plnění je mimo tvou nabídku.' };
}
// den na dotazy pro ukázku: 8 dní před lhůtou, ale ne v minulosti (jinak by ho detail neukázal)
const qDay = (deadline) => {
  if (!deadline) return '';
  const today = new Date().toISOString().slice(0, 10);
  const q = addDays(deadline, -8);
  return q >= today ? q : deadline > today ? addDays(today, 1) : '';
};
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.25, colorScheme: 'dark', locale: 'cs-CZ' });
  const p = await ctx.newPage();

  // AI odpovědi jen pro ukázku v návodu (lokálně není klíč)
  await p.route(/\/api\/search/, async (route) => {
    const r = await route.fetch({ timeout: 300000 });
    const fix = (d) => {
      d.warnings = [];
      d.results = (d.results || []).map((t) => ({ ...t, ...fakeScore(t) })).filter((t) => t.score >= 50).sort((a, b) => b.score - a.score);
      d.scored = d.results.length;
      return d;
    };
    const body = await r.text();
    if (route.request().url().includes('stream=1')) {
      const lines = body.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => (m.result ? { result: fix(m.result) } : m));
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
    } else await route.fulfill({ json: fix(JSON.parse(body)) });
  });
  await p.route('**/api/analyze', async (route) => {
    const body = route.request().postDataJSON();
    const t = body.tender;
    if (body.kind === 'draft') {
      return route.fulfill({ json: { cost: 0.03, data: {
        outline: [
          { heading: '1. Pochopení zadání', points: [`Shrnutí potřeb zadavatele ${t.buyer}`, 'Hlavní cíle a měřitelné výsledky'] },
          { heading: '2. Navržené řešení', points: ['Architektura a moduly', 'Zabezpečení a soulad s NIS2', 'Integrace na stávající systémy'] },
          { heading: '3. Harmonogram a tým', points: ['Etapy s milníky a předávacími protokoly', 'Kontaktní osoba a zástup'] },
          { heading: '4. Reference', points: ['Tři podobné projekty z knihovny referencí'] },
        ],
        coverLetter: `Vážení,\n\nk veřejné zakázce „${t.title}“ předkládáme nabídku řešení, které jsme podobným zadavatelům už dodali. ...`,
        references: [],
      } } });
    }
    const q = t.deadline ? addDays(t.deadline, -8) : '';
    return route.fulfill({ json: { cost: 0.04, data: {
      summary: `Zadavatel ${t.buyer} poptává dodávku a zavedení řešení „${t.title}“ včetně zaškolení a podpory.`,
      requirements: ['Základní a profesní způsobilost (výpis z OR / živnostenský list)', '2 reference podobného rozsahu za poslední 3 roky', 'Podpora a servis minimálně 24 měsíců'],
      risks: ['Krátká lhůta na podání nabídky', 'Smluvní pokuta 0,2 % za každý den prodlení'],
      verdict: 'go', verdictReason: 'Rozsah sedí na tvé produkty a kvalifikaci splníš.',
      offer: 'Nabídni hotové řešení s úpravou na míru, pevnou cenu a zkušební provoz.',
      questions: ['Je možné řešení provozovat v cloudu?', 'Jaký je počet uživatelů?'],
      checklist: ['Krycí list', 'Čestné prohlášení o způsobilosti', 'Seznam referencí', 'Technický popis řešení', 'Podepsaný návrh smlouvy'],
      criteria: ['Cena 70 %', 'Kvalita řešení 30 %'],
      sources: ['Zadávací dokumentace.pdf', 'Příloha 1 – technická specifikace.docx'],
      questionsDeadline: q,
    } } });
  });
  await p.route('**/api/assess', (route) => {
    const t = route.request().postDataJSON().tender;
    return route.fulfill({ json: { cost: 0.03,
      // rozbor je součástí posouzení (jedno čtení dokumentace)
      analysis: {
        summary: `Zadavatel ${t.buyer} poptává dodávku a zavedení řešení „${t.title}“ včetně zaškolení a dvouleté podpory.`,
        requirements: [], verdict: 'consider', verdictReason: '',
        risks: ['Krátká lhůta na podání nabídky', 'Zkušební provoz před převzetím trvá 30 dní'],
        offer: 'Nabídni hotové řešení s úpravou na míru, pevnou cenu a zkušební provoz.',
        questions: [],
        checklist: ['Krycí list', 'Čestné prohlášení o způsobilosti', 'Seznam referencí', 'Technický popis řešení', 'Podepsaný návrh smlouvy'],
        criteria: ['Cena 70 %', 'Kvalita řešení 30 %'],
        sources: ['Zadávací dokumentace.pdf', 'Příloha 1 – technická specifikace.docx', 'Návrh smlouvy.docx'],
        questionsDeadline: qDay(t.deadline),
      },
      data: {
        verdict: 'podat s partnerem', verdictReason: 'Dílo zvládnete, chybí ale obrat 5 mil. Kč – řešit společnou nabídkou.',
        qualification: [
          { area: 'ekonomická', kind: 'obrat', requirement: 'Obrat min. 5 mil. Kč za poslední 3 roky', where: 'čl. 6.3, str. 4', status: 'nesplněno', how: 'Společná nabídka s partnerem (§ 82 ZZVZ).', calc: 'nejvyšší roční obrat v profilu je 3,2 mil. Kč, požadováno 5 mil. Kč – chybí 1,8 mil. Kč.' },
          { area: 'technická', kind: 'reference', requirement: '2 reference na obdobné plnění nad 400 tis. Kč', where: 'čl. 7.1, str. 5', status: 'splněno', how: 'Reference z knihovny.', calc: 'sedí 2 ze 2 požadovaných: Vzdělávací portál pro zaměstnance kraje (480 tis. Kč), Klientský portál (650 tis. Kč).' },
          { area: 'profesní', requirement: 'Výpis z obchodního rejstříku', where: 'čl. 5.2', status: 'doložit', how: 'Stáhnout výpis z justice.cz.' },
          { area: 'technická', kind: 'certifikát', requirement: 'Certifikace ISO 27001', where: 'čl. 7.4', status: 'nejasné', how: 'V profilu neuvedeno.' }],
        delivery: { feasible: 'ano', summary: 'Pokryje vlastní řešení s úpravami integrace a reportů.', totalMd: 52, stack: 'React, Node.js, PostgreSQL', timeline: 'Vejde se do 4 měsíců při 2 vývojářích.',
          parts: [{ item: 'Nasazení a konfigurace', how: 'vlastní produkt', effortMd: 12, risk: 'nízké' }, { item: 'Integrace AD/SSO', how: 'nový vývoj', effortMd: 18, risk: 'střední' }, { item: 'Migrace dat', how: 'import', effortMd: 22, risk: 'vysoké' }] },
        price: { md: 52, dayRate: 9000, cost: 468000, value: 900000, level: 'ok', text: '52 člověkodní × 9 000 Kč = 468 tis. Kč, předpokládaná hodnota 900 tis. Kč – zbývá rezerva 432 tis. Kč.' },
        contract: [
          { risk: 'Smluvní pokuta 0,2 % z ceny za každý den prodlení', where: 'čl. 12.1 smlouvy', severity: 'vysoké', note: 'Bez stropu – navrhni v dotazu omezení na 10 % ceny.' },
          { risk: 'Záruka 36 měsíců s odezvou do 4 hodin', where: 'čl. 9.2 smlouvy', severity: 'střední', note: 'Započítej pohotovost do ceny podpory.' },
          { risk: 'Platba až po převzetí celého díla', where: 'čl. 5.1 smlouvy', severity: 'nízké', note: '' }],
        partners: [
          { name: 'Ukázka Software s.r.o.', wins: 4, total: 12400000, example: 'Portál pro vzdělávání zaměstnanců úřadu' },
          { name: 'Příklad IT a.s.', wins: 2, total: 6100000, example: 'Dodávka a implementace LMS' }],
        gaps: ['Partner s obratem nad 5 mil. Kč'], missingInfo: ['Certifikace ISO 27001'], questions: ['Lze obrat prokázat společně s partnerem?', 'Je možné omezit výši smluvní pokuty?'],
        sources: ['Zadávací dokumentace.pdf', 'Příloha 1 – technická specifikace.docx', 'Návrh smlouvy.docx'],
        skipped: [{ name: 'Výkresy.zip', why: 'příliš velký soubor' }],
        model: 'haiku', at: new Date().toISOString() } } });
  });
  await p.route('**/api/ask', (route) => route.fulfill({ json: {
    text: 'Požadují 2 reference na dodávku podobného systému za poslední 3 roky, každou v hodnotě alespoň 300 000 Kč bez DPH. K referenci stačí čestné prohlášení s kontaktem na objednatele.',
    cites: [{ doc: 'Zadávací dokumentace.pdf', where: 'str. 7' }], cost: 0.01, docs: 2 } }));

  async function shot(id, ...targets) {
    if (ONLY && !id.startsWith(ONLY)) return;
    await p.waitForTimeout(500);
    let box = null;
    for (const t of targets) {
      const r = typeof t === 'function' ? await t() : (await t.count()) ? await t.first().boundingBox() : null;
      if (!r) continue;
      box = box ? { x: Math.min(box.x, r.x), y: Math.min(box.y, r.y), x2: Math.max(box.x2, r.x + r.width), y2: Math.max(box.y2, r.y + r.height) } : { x: r.x, y: r.y, x2: r.x + r.width, y2: r.y + r.height };
    }
    await p.screenshot({ path: `${OUT}/${id}.jpg`, type: 'jpeg', quality: 72 });
    if (box) {
      const pad = 6;
      const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad), x2 = Math.min(W, box.x2 + pad), y2 = Math.min(H, box.y2 + pad);
      boxes[id] = [x / W, y / H, (x2 - x) / W, (y2 - y) / H].map((v) => +(v * 100).toFixed(1));
    } else delete boxes[id];
    console.log('shot', id, boxes[id] ?? '-');
  }
  // sekce: nadpis a všechno pod ním až k dalšímu nadpisu
  const section = (scope, text) => async () =>
    p.evaluate(([scope, text]) => {
      const root = document.querySelector(scope);
      const h = [...root.querySelectorAll('h2, h3')].find((e) => e.textContent.trim().startsWith(text));
      if (!h) return null;
      let r = h.getBoundingClientRect(); let x = r.left, y = r.top, x2 = r.right, y2 = r.bottom;
      for (let e = h.nextElementSibling; e && !/^H[23]$/.test(e.tagName); e = e.nextElementSibling) {
        const q = e.getBoundingClientRect(); if (!q.height) continue;
        x = Math.min(x, q.left); x2 = Math.max(x2, q.right); y2 = Math.max(y2, q.bottom);
      }
      return { x, y, width: x2 - x, height: y2 - y };
    }, [scope, text]);
  const toTop = (scope, text, off = 150) =>
    p.evaluate(([scope, text, off]) => {
      const h = [...document.querySelector(scope).querySelectorAll('h2, h3')].find((e) => e.textContent.trim().startsWith(text));
      h.scrollIntoView({ block: 'start' });
      const sc = h.closest('.drawer') || document.scrollingElement; sc.scrollTop -= off;
    }, [scope, text, off]);

  // přihlášení
  await p.goto(B + '/login'); await p.waitForLoadState('networkidle');
  await p.fill('input[name=password]', process.env.GUIDE_PASSWORD);
  const u = p.locator('input[name=username]:visible'); if (await u.count()) await u.fill('marek');
  await p.keyboard.press('Enter');
  await p.waitForURL(B + '/', { timeout: 90000 });
  await p.waitForTimeout(1500);
  const tab = (n) => p.locator('nav.tabs button', { hasText: n }).first().click();
  const gear = () => p.locator('button.gear').click();
  // Nastavení má záložky Firma / Upozornění / AI a data / Účet
  const sTab = async (n) => { await p.locator('.drawer .settings-tabs button', { hasText: n }).click(); await p.waitForTimeout(500); };
  const closeDrawer = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(400); };

  // ---------- hledání
  await tab('Zakázky');
  await p.waitForTimeout(800);
  await p.locator('aside.side button', { hasText: 'Vybrat všechny' }).click().catch(() => {});
  await shot('hledani-1', p.locator('aside.side'));
  const find = p.locator('.content button.primary', { hasText: 'Najít zakázky' }).first();
  await shot('hledani-2', find);
  await find.click();
  await p.locator('article').first().waitFor({ timeout: 540000 });
  await p.waitForTimeout(1500);
  await shot('hledani-3', p.locator('article').first());
  // karta se lhůtou – jinak detail neukáže poslední den na dotazy
  const withDeadline = p.locator('article').filter({ hasNotText: 'lhůta neuvedena' });
  const card = (await withDeadline.count()) ? withDeadline.first() : p.locator('article').first();
  const cardTitle = (await card.locator('h3').first().innerText()).trim();
  await card.click();
  await p.locator('.drawer #d-top').waitFor();
  await p.waitForTimeout(800);
  await shot('detail-1', p.locator('.drawer dl.facts'));
  await p.locator('.drawer .status-row').scrollIntoViewIfNeeded();
  await shot('detail-2', p.locator('.drawer .status-row'));
  await p.locator('.drawer .flow button', { hasText: /připravuji/i }).first().click().catch(() => console.log('no bid btn'));
  await p.waitForTimeout(4500); // oznámení „Přidáno do Moje zakázky“ zmizí
  await toTop('.drawer', 'Zadávací podklady');
  await shot('podklady-1', section('.drawer', 'Zadávací podklady'));
  await toTop('.drawer', 'Posouzení zakázky');
  await shot('zvladneme-1', p.locator('.drawer .assess-modes'));
  await p.locator('.drawer .assess-mode').first().click();
  await p.locator('.drawer .assess .verdict').waitFor();
  await p.evaluate(() => { document.querySelector('.drawer .assess .assess-kind').scrollIntoView({ block: 'start' }); document.querySelector('.drawer').scrollTop -= 150; });
  await shot('zvladneme-2', p.locator('.drawer .assess .verdict'), p.locator('.drawer .assess-summary'), p.locator('.drawer .qual-list').first());
  const h4 = (text, off = 150) => p.evaluate(([text, off]) => {
    [...document.querySelectorAll('.drawer h4')].find((e) => e.textContent.trim().startsWith(text))?.scrollIntoView({ block: 'start' });
    document.querySelector('.drawer').scrollTop -= off;
  }, [text, off]);
  await h4('Realizace');
  await shot('zvladneme-3', p.locator('.drawer h4', { hasText: 'Realizace' }), p.locator('.drawer .md-table'), p.locator('.drawer .price-check'));
  await h4('Smluvní rizika');
  await shot('zvladneme-4', p.locator('.drawer h4', { hasText: 'Smluvní rizika' }), p.locator('.drawer .qual-list').nth(1), p.locator('.drawer .partner-list'));
  await h4('Další rizika');
  await shot('zvladneme-5', p.locator('.drawer h4', { hasText: 'Další rizika' }), p.locator('.drawer .docs-read'));
  await toTop('.drawer', 'Co připravit');
  await shot('detail-5', section('.drawer', 'Co připravit'));
  await toTop('.drawer', 'Návrh nabídky');
  await p.locator('.drawer button', { hasText: 'Navrhnout' }).first().click();
  await p.waitForTimeout(800);
  await toTop('.drawer', 'Návrh nabídky');
  await shot('detail-6', section('.drawer', 'Návrh nabídky'));
  await p.locator('.drawer #d-top').scrollIntoViewIfNeeded();
  await p.evaluate(() => (document.querySelector('.drawer').scrollTop = 0));
  await p.waitForTimeout(400);
  await shot('lhuty-1', p.locator('.drawer dl.facts > div', { hasText: 'Dotazy na zadavatele' }));
  await shot('hlidani-0', p.locator('.drawer button.follow'));
  await p.locator('.drawer button.follow').click();
  // zeptej se
  await toTop('.drawer', 'Zeptej se dokumentace');
  await shot('ask-1', section('.drawer', 'Zeptej se dokumentace'));
  await p.locator('.drawer input[placeholder*="certifikace"]').fill('Jaké reference požadují?');
  await p.keyboard.press('Enter');
  await p.locator('.drawer .qa').waitFor();
  await toTop('.drawer', 'Zeptej se dokumentace');
  await shot('ask-2', p.locator('.drawer .qa').first());
  // cena a šance
  await toTop('.drawer', 'Cena, šance');
  await shot('cena-1', p.locator('.drawer button', { hasText: 'Porovnat s podobnými' }).first());
  await p.locator('.drawer button', { hasText: 'Porovnat s podobnými' }).first().click();
  await p.locator('.drawer .chance').waitFor({ timeout: 120000 }).catch(() => console.log('no chance'));
  await toTop('.drawer', 'Cena, šance');
  await shot('cena-2', section('.drawer', 'Cena, šance'));
  await toTop('.drawer', 'Dokumenty nabídky');
  await shot('firma-0', section('.drawer', 'Dokumenty nabídky'));
  await closeDrawer();

  // ---------- nastavení: firma a reference
  await gear();
  await p.waitForTimeout(600);
  await sTab('Firma');
  await toTop('.drawer', 'Firma a reference');
  await p.locator('.drawer input[placeholder="IČO"]').fill('61974757');
  await shot('firma-1', p.locator('.drawer input[placeholder="IČO"]'), p.locator('.drawer button', { hasText: 'Načíst z ARES' }));
  await p.locator('.drawer button', { hasText: 'Načíst z ARES' }).click();
  await p.waitForTimeout(2500);
  const lab = (l) => p.locator('.drawer label', { hasText: l }).locator('xpath=following-sibling::input[1]');
  await lab('Kdo podepisuje').fill('Jan Ukázka');
  await lab('Funkce').fill('jednatel');
  await lab('E-mail').fill('nabidky@example.cz');
  await lab('Telefon').fill('+420 600 000 000');
  await toTop('.drawer', 'Firma a reference');
  await shot('firma-2', section('.drawer', 'Firma a reference'));
  await p.locator('.drawer button', { hasText: 'Uložit firmu' }).click();
  await p.locator('.drawer button', { hasText: '+ Přidat referenci' }).click();
  const ref = p.locator('.drawer .ref-edit');
  await ref.locator('input').nth(0).fill('Vzdělávací portál pro zaměstnance kraje');
  await ref.locator('input').nth(1).fill('Krajský úřad (ukázka)');
  await ref.locator('input').nth(3).fill('480000');
  await ref.locator('textarea').fill('LMS s e-learningem povinných školení, 1 200 uživatelů, napojení na AD.');
  await ref.scrollIntoViewIfNeeded();
  await shot('firma-3', ref);
  await ref.locator('button', { hasText: 'Uložit referenci' }).click();
  await p.waitForTimeout(800);
  // AI, ranní rozbor
  await sTab('AI a data');
  await toTop('.drawer', 'AI a útrata');
  await shot('rano-1', section('.drawer', 'AI a útrata'));
  const morning = p.locator('.drawer label', { hasText: 'Ranní posouzení' });
  await morning.scrollIntoViewIfNeeded();
  await p.locator('.drawer label:has-text("Ranní posouzení") + select').selectOption('1');
  await p.evaluate(() => { const l = [...document.querySelectorAll('.drawer label')].find((e) => e.textContent.startsWith('Ranní posouzení')); l.scrollIntoView({ block: 'center' }); });
  await shot('rano-2', morning, p.locator('.drawer label:has-text("Ranní posouzení") + select'), p.locator('.drawer label:has-text("Ranní posouzení") + select + p'));
  await sTab('Upozornění');
  await toTop('.drawer', 'Kalendář lhůt');
  await shot('lhuty-2', section('.drawer', 'Kalendář lhůt'));
  await toTop('.drawer', 'Upozornění na telefon');
  await shot('lhuty-3', section('.drawer', 'Upozornění na telefon'));
  await sTab('Účet');
  await toTop('.drawer', 'Zabezpečení');
  await shot('ucty-1', section('.drawer', 'Zabezpečení'));
  await toTop('.drawer', 'Správa účtů');
  await shot('ucty-2', section('.drawer', 'Správa účtů'));
  await closeDrawer();

  // dokumenty v detailu s vyplněnou firmou
  await tab('Zakázky');
  await p.locator('article', { hasText: cardTitle }).first().click();
  await p.locator('.drawer #d-top').waitFor();
  await toTop('.drawer', 'Dokumenty nabídky');
  await shot('firma-4', section('.drawer', 'Dokumenty nabídky'));
  await closeDrawer();

  // ---------- moje zakázky
  await tab('Moje zakázky');
  await p.waitForTimeout(1000);
  await shot('moje-1', p.locator('.board'));

  // ---------- hlídání
  await tab('Hlídání');
  await p.waitForTimeout(1500);
  await shot('hlidani-1', p.locator('.content button.primary').first());
  // Hlídání má záložky Profily / Zadavatelé / Konkurenti / Smlouvy
  const wTab = async (n) => { await p.locator('.content nav button', { hasText: n }).first().click(); await p.waitForTimeout(700); };
  await wTab('Zadavatelé');
  await shot('hlidani-2', p.locator('.content nav button', { hasText: 'Zadavatelé' }).first(), p.locator('.content .card').first());
  await wTab('Smlouvy');
  await p.locator('#cw').fill('00064581');
  await p.locator('.contract-watch button.primary').click(); // Vyhledat
  const follow = p.locator('.contract-watch button', { hasText: /^\s*Sledovat\s*$/ }).first();
  await follow.waitFor({ timeout: 30000 });
  await follow.click();
  await p.waitForTimeout(6000);
  await p.locator('.contract-watch button', { hasText: 'Hotovo' }).click().catch(() => {});
  await p.waitForTimeout(800);
  await p.evaluate(() => { document.querySelector('.contract-watch').scrollIntoView({ block: 'start' }); window.scrollBy(0, -100); });
  await shot('hlidani-3', p.locator('.contract-watch'), p.locator('.content .report-head').first());

  // ---------- průzkum trhu
  await tab('Průzkum trhu');
  await p.waitForTimeout(800);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.locator('aside.side label:has-text("Kraj") + select, .content label:has-text("Kraj") + select').first().selectOption({ label: 'Hlavní město Praha' }).catch(async () => {
    const s = p.locator('label:has-text("Kraj") + select').first(); const o = await s.locator('option').nth(1).getAttribute('value'); await s.selectOption(o);
  });
  await shot('trh-1', p.locator('label:has-text("Kraj")').first(), p.locator('label:has-text("Kraj") + select').first());
  await p.locator('.content button.primary').first().click();
  await p.locator('.kpis').waitFor({ timeout: 120000 });
  await p.waitForTimeout(800);
  await shot('trh-2', p.locator('.kpis'));
  await p.evaluate(() => [...document.querySelectorAll('.content h2')].find((e) => e.textContent.startsWith('Nejčastější vítězové'))?.scrollIntoView({ block: 'start' }));
  await p.evaluate(() => window.scrollBy(0, -80));
  await shot('trh-3', section('.content', 'Nejčastější vítězové'));
  const win = p.locator('.content table button').first();
  if (await win.count()) {
    await win.click();
    await p.waitForTimeout(3000);
    await shot('trh-4', p.locator('.drawer'));
    await closeDrawer();
  }

  // ---------- dnes
  await tab('Dnes');
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('dnes-1', p.locator('.content').first());

  fs.writeFileSync(OUT + '/boxes.json', JSON.stringify(boxes, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
