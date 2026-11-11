import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GUIDE } from "@/lib/guide";
import { currentUser } from "@/lib/users";

// návody jen pro správce (vlastníka)
export async function GET() {
  if (!(await currentUser()).owner) return Response.json({ error: "Jen pro správce." }, { status: 403 });
  const boxes: Record<string, number[]> = JSON.parse(await readFile(path.join(process.cwd(), "guide", "boxes.json"), "utf8"));
  // kroky, ke kterým ještě není snímek, vynechat (a kapitoly bez kroků taky)
  const has = (img: string) => existsSync(path.join(process.cwd(), "guide", `${img}.jpg`));
  const chapters = GUIDE.map((c) => ({ ...c, steps: c.steps.filter((s) => has(s.img)).map((s) => ({ ...s, box: boxes[s.img] })) })).filter((c) => c.steps.length);
  return Response.json({ chapters }, { headers: { "Cache-Control": "private, no-store" } });
}
