import { runSearch } from "@/lib/search";
import type { SearchRequest } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as SearchRequest;
  try {
    const result = await runSearch(body);
    return Response.json(result);
  } catch (e: any) {
    return Response.json({ error: `Hledání selhalo: ${e.message}` }, { status: 500 });
  }
}
