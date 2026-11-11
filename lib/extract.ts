// Vytažení textu ze zadávacích podkladů přímo v prohlížeči – i velké soubory (desítky MB), protože
// na server pak jde jen text (požadavek na Vercel smí mít nejvýš ~4 MB). Dokumenty se nikam neukládají.
// PDF (pdf.js), Word (.docx), Excel (.xlsx), OpenDocument (.odt, .ods), text a ZIP s čímkoli z toho.
import { unzipSync } from "fflate";

export type ExtractedDoc = { name: string; text: string; pages?: number; note?: string };

const PER_DOC = 160_000; // znaků z jednoho dokumentu
const TOTAL = 420_000; // znaků celkem (~120 tis. tokenů)

const xmlText = (xml: string) =>
  xml
    .replace(/<\/(w:p|text:p|text:h|a:p)>/g, "\n")
    .replace(/<(w:tab|text:tab)\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function xlsxText(files: Record<string, Uint8Array>) {
  const shared = files["xl/sharedStrings.xml"]
    ? [...dec(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1]))
    : [];
  const sheets = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  return sheets
    .map((n, i) => {
      const rows = [...dec(files[n]).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
        [...r[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)]
          .map(([, attrs, body]) => {
            const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
            return /t="s"/.test(attrs) ? (shared[Number(v)] ?? "") : xmlText(v);
          })
          .filter(Boolean)
          .join(" | "),
      );
      return `[List ${i + 1}]\n${rows.filter(Boolean).join("\n")}`;
    })
    .join("\n\n");
}

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: bytes, disableFontFace: true });
  const doc = await task.promise;
  const parts: string[] = [];
  let len = 0;
  for (let i = 1; i <= doc.numPages && len < PER_DOC; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    const t = c.items.map((it: any) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("");
    parts.push(`[str. ${i}]\n${t.trim()}`);
    len += t.length;
  }
  const pages = doc.numPages;
  await task.destroy();
  return { text: parts.join("\n\n"), pages };
}

async function one(name: string, bytes: Uint8Array, out: ExtractedDoc[]) {
  const lower = name.toLowerCase();
  const head = dec(bytes.slice(0, 5));
  if (head.startsWith("%PDF")) {
    const { text, pages } = await pdfText(bytes);
    const scanned = text.replace(/\[str\. \d+\]|\s/g, "").length < pages * 40;
    out.push({ name, text, pages, note: scanned ? "vypadá naskenovaný – text skoro žádný, AI ho nepřečte" : undefined });
    return;
  }
  if (head.startsWith("PK")) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      out.push({ name, text: "", note: "poškozený archiv" });
      return;
    }
    if (files["word/document.xml"]) return void out.push({ name, text: xmlText(dec(files["word/document.xml"])) });
    if (files["xl/workbook.xml"]) return void out.push({ name, text: xlsxText(files) });
    if (files["content.xml"]) return void out.push({ name, text: xmlText(dec(files["content.xml"])) });
    // ZIP s podklady: projít, co uvnitř umíme číst
    for (const [n, b] of Object.entries(files)) {
      if (n.startsWith("__MACOSX") || n.endsWith("/") || !b.length) continue;
      if (/\.(pdf|docx|xlsx|odt|ods|zip|txt|csv)$/i.test(n)) await one(n.split("/").pop()!, b, out);
    }
    return;
  }
  if (/\.(txt|csv|xml|html?)$/i.test(lower)) return void out.push({ name, text: dec(bytes) });
  if (/\.(doc|xls)$/i.test(lower)) return void out.push({ name, text: "", note: "starý formát Office – ulož ho jako .docx/.xlsx nebo PDF" });
  out.push({ name, text: "", note: "tenhle formát neumím přečíst" });
}

// důležité dokumenty dopředu, kdyby se všechno nevešlo
const PRIORITY = [/zad[aá]vac|v[yý]zv|kvalifik|podm[ií]nk/i, /technick|specifik|po[zž]adav|zad[aá]n[ií]/i, /smlouv|obchodn/i, /krycí|formul|p[rř][ií]loh/i];
const rank = (n: string) => {
  const i = PRIORITY.findIndex((r) => r.test(n));
  return i < 0 ? PRIORITY.length : i;
};

export async function extractFiles(files: File[], onFile?: (name: string, i: number, all: number) => void) {
  const out: ExtractedDoc[] = [];
  for (const [i, f] of files.entries()) {
    onFile?.(f.name, i, files.length);
    try {
      await one(f.name, new Uint8Array(await f.arrayBuffer()), out);
    } catch (e: any) {
      out.push({ name: f.name, text: "", note: `nejde přečíst (${e?.message ?? e})` });
    }
  }
  // zkrátit: nejdřív každý dokument na PER_DOC, pak celkem na TOTAL podle priority
  const sorted = [...out].sort((a, b) => rank(a.name) - rank(b.name));
  let left = TOTAL;
  const docs = sorted.map((d) => {
    let text = d.text.slice(0, PER_DOC);
    const cut = text.length < d.text.length;
    const take = Math.max(0, Math.min(text.length, left));
    left -= take;
    const short = take < text.length;
    text = text.slice(0, take);
    return { ...d, text, note: [d.note, cut || short ? (take ? "zkráceno, je moc dlouhý" : "nevešel se, je toho moc") : ""].filter(Boolean).join("; ") || undefined };
  });
  return docs;
}
