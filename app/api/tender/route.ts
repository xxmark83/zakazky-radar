import { getAlerted } from "@/lib/store";

// Jedna zakázka podle id – pro odkaz z upozornění na telefonu (/?z=id), když ji prohlížeč ještě nemá
// ve výsledcích hledání. Hledá mezi zakázkami z ranních upozornění a mezi sledovanými (jen vlastní data účtu).
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id || id.length > 300) return Response.json({ error: "Chybí id zakázky." }, { status: 400 });
  const tender = await getAlerted(id);
  return tender ? Response.json({ tender }) : Response.json({ error: "Zakázka nenalezena." }, { status: 404 });
}
