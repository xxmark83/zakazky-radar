import { sendPlain } from "./email";
import { sendPush } from "./push";
import { withUser, type User } from "./users";

/** Bezpečnostní upozornění uživateli: na telefon a e-mailem (když ho má). Chyby nevadí – jen informace. */
export async function securityNotice(u: User, title: string, body: string) {
  await withUser(u, async () => {
    await sendPush({ title, body, url: "/", tag: `bezpecnost-${Date.now()}` }).catch(() => 0);
    if (u.email) await sendPlain(`Zakázky radar: ${title}`, body).catch(() => {});
  });
}
