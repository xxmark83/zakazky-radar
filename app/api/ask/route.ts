import { askCited, pickModel } from "@/lib/ai";
import { fetchDocs, type Doc } from "@/lib/docs";
import { addSpend } from "@/lib/store";
import type { Tender } from "@/lib/types";

export const maxDuration = 300;

// Otázky nad zadávací dokumentací: odpověď jen z dokumentů, s odkazem na stranu.
// Dokumenty jdou do mezipaměti (prompt caching), další otázky do pár minut jsou proto levné.
const SYSTEM = `Odpovídáš na otázky dodavatele k zadávací dokumentaci veřejné zakázky. Vycházej jen z přiložených dokumentů
a cituj je. Když odpověď v dokumentech není, napiš to otevřeně a navrhni, jak se zeptat zadavatele. Česky, stručně, věcně.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Chybí ANTHROPIC_API_KEY." }, { status: 400 });
  const body = (await req.json()) as { tender: Tender; question: string; model?: string; texts?: { name: string; text: string }[] };
  if (!body.question?.trim()) return Response.json({ error: "Napiš otázku." }, { status: 400 });
  try {
    const uploaded = (body.texts ?? []).filter((d) => String(d.text).trim()).slice(0, 40);
    const docs: Doc[] = uploaded.length
      ? uploaded.map((d) => ({ name: String(d.name).slice(0, 200), type: "nahráno", text: String(d.text).slice(0, 200_000) }))
      : await fetchDocs(body.tender);
    if (!docs.length)
      return Response.json({ error: "Dokumentaci se nepodařilo stáhnout. Otevři zakázku na portálu a podívej se do ní tam." }, { status: 404 });
    const blocks = docs.map((d, i) => ({
      type: "document",
      title: d.name,
      citations: { enabled: true },
      source: "pdf" in d ? { type: "base64", media_type: "application/pdf", data: d.pdf } : { type: "text", media_type: "text/plain", data: d.text },
      // mezipaměť na posledním dokumentu: celá dokumentace se pak při dalších otázkách nečte znovu za plnou cenu
      ...(i === docs.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
    }));
    const r = await askCited({
      model: pickModel(body.model),
      system: SYSTEM,
      content: [...blocks, { type: "text", text: `Zakázka: ${body.tender.title}\n\nOtázka: ${body.question.trim()}` }],
      texts: docs.map((d) => ("text" in d ? d.text : "")),
    });
    await addSpend(r.cost).catch(() => {});
    return Response.json({ ...r.data, cost: r.cost, docs: docs.map((d) => d.name) });
  } catch (e: any) {
    return Response.json({ error: `Odpověď selhala: ${e.message}` }, { status: 500 });
  }
}
