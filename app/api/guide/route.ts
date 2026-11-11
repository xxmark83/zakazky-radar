import { readFile } from "node:fs/promises";
import path from "node:path";
import { GUIDE } from "@/lib/guide";
import { currentUser } from "@/lib/users";

// návody jen pro správce (vlastníka)
export async function GET() {
  if (!(await currentUser()).owner) return Response.json({ error: "Jen pro správce." }, { status: 403 });
  const boxes: Record<string, number[]> = JSON.parse(await readFile(path.join(process.cwd(), "guide", "boxes.json"), "utf8"));
  const chapters = GUIDE.map((c) => ({ ...c, steps: c.steps.map((s) => ({ ...s, box: boxes[s.img] })) }));
  return Response.json({ chapters }, { headers: { "Cache-Control": "private, no-store" } });
}
