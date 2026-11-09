import { accessMap, setAccess, type Access } from "@/lib/access";
import { currentUser, users } from "@/lib/users";

// Správa účtů: jen vlastník vidí ostatní účty a nastavuje, co smí hledat
async function ownerOnly() {
  return (await currentUser()).owner ? null : Response.json({ error: "Jen pro vlastníka." }, { status: 403 });
}

export async function GET() {
  const deny = await ownerOnly();
  if (deny) return deny;
  const map = await accessMap();
  return Response.json({
    users: users()
      .filter((u) => !u.owner)
      .map((u) => ({ name: u.name, email: Boolean(u.email), access: map[u.name] ?? { presets: null, edit: false } })),
  });
}

export async function POST(req: Request) {
  const deny = await ownerOnly();
  if (deny) return deny;
  const body = (await req.json()) as { name: string; access: Access };
  try {
    await setAccess(body.name, body.access);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
