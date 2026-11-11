import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/users";

export async function GET(_req: Request, { params }: { params: Promise<{ img: string }> }) {
  if (!(await currentUser()).owner) return new Response("Jen pro správce.", { status: 403 });
  const { img } = await params;
  if (!/^[a-z]+-\d+\.jpg$/.test(img)) return new Response("Nenalezeno", { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), "guide", img));
    return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new Response("Nenalezeno", { status: 404 });
  }
}
