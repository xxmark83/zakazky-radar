import { companyFromAres, EMPTY_COMPANY, getCompany, getReferences, saveCompany, saveReferences, type Company, type Reference } from "@/lib/company";
import { randomId } from "@/lib/crypto";
import { redis } from "@/lib/store";

// Firemní profil a knihovna referencí (Nastavení → Firma a reference)
export async function GET() {
  return Response.json({ db: Boolean(redis), company: (await getCompany()) ?? EMPTY_COMPANY, references: await getReferences() });
}

export async function POST(req: Request) {
  if (!redis) return Response.json({ error: "Potřebuje databázi (Upstash)." }, { status: 400 });
  const body = (await req.json()) as { ares?: string; company?: Company; reference?: Reference; removeReference?: string };
  if (body.ares) {
    const found = await companyFromAres(body.ares);
    if (!found) return Response.json({ error: "IČO jsem v ARES nenašel." }, { status: 404 });
    return Response.json({ company: { ...EMPTY_COMPANY, ...(await getCompany()), ...found } });
  }
  if (body.company) await saveCompany(body.company);
  if (body.reference || body.removeReference) {
    let list = await getReferences();
    if (body.removeReference) list = list.filter((r) => r.id !== body.removeReference);
    if (body.reference) {
      const r = { ...body.reference, id: body.reference.id || randomId(8) };
      list = list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r];
    }
    await saveReferences(list);
  }
  return Response.json({ company: (await getCompany()) ?? EMPTY_COMPANY, references: await getReferences() });
}
