import { accessFor, allowedForm } from "@/lib/access";
import { runSearch, type SearchProgress } from "@/lib/search";
import type { SearchRequest } from "@/lib/types";

export const maxDuration = 300;

// s ?stream=1 posílá průběh po řádcích (NDJSON): zdroje, AI dávky a nakonec výsledek
export async function POST(req: Request) {
  const body = (await req.json()) as SearchRequest & { name?: string };
  if (!allowedForm(await accessFor(), body)) {
    return Response.json({ error: "Tuto oblast hledání nemáš povolenou. Vyber jinou v „Co hledáš“." }, { status: 403 });
  }
  if (new URL(req.url).searchParams.get("stream") !== "1") {
    try {
      return Response.json(await runSearch(body));
    } catch (e: any) {
      return Response.json({ error: `Hledání selhalo: ${e.message}` }, { status: 500 });
    }
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: object) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const result = await runSearch(body, (p: SearchProgress) => send({ progress: p }));
        send({ result });
      } catch (e: any) {
        send({ error: `Hledání selhalo: ${e.message}` });
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
