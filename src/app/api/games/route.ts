import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo, type PushPayload } from "@/lib/push";
import { B64_RE, fail, json, readJson, UUID_RE } from "@/lib/server-utils";
import { pron, type Gender } from "@/lib/pronouns";
import { getMe, getPartnerId } from "@/lib/session";

const TITLES: Record<string, string> = { wyr: "Would you rather", tot: "This or that", know: "How well do you know me" };
const okCipher = (iv: unknown, ct: unknown) =>
  typeof iv === "string" && iv.length <= 32 && B64_RE.test(iv) &&
  typeof ct === "string" && ct.length > 0 && ct.length <= 4000 && B64_RE.test(ct);

// Recent games. Your partner's answers are only sent once you've submitted yours: no peeking.
export async function GET() {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const rows = await db()`
    select g.id, g.kind, g.created_by, g.subject, g.iv, g.ciphertext, g.created_at, g.finished_at,
           mine.iv as my_iv, mine.ciphertext as my_ct,
           (theirs.member_id is not null) as partner_answered,
           case when mine.member_id is not null then theirs.iv end as their_iv,
           case when mine.member_id is not null then theirs.ciphertext end as their_ct,
           theirs.member_id as their_id
    from games g
    left join game_answers mine on mine.game_id = g.id and mine.member_id = ${me.memberId}
    left join game_answers theirs on theirs.game_id = g.id and theirs.member_id <> ${me.memberId}
    where g.space_id = ${me.spaceId}
    order by g.created_at desc
    limit 40`;
  return json({
    games: rows.map((r) => ({
      id: r.id, kind: r.kind, createdBy: r.created_by, subject: r.subject, iv: r.iv, ct: r.ciphertext,
      createdAt: r.created_at, finishedAt: r.finished_at,
      mine: r.my_iv ? { iv: r.my_iv, ct: r.my_ct } : null,
      partnerAnswered: r.partner_answered,
      theirs: r.their_iv ? { memberId: r.their_id, iv: r.their_iv, ct: r.their_ct } : null,
    })),
  });
}

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const b = await readJson<{ action?: string; id?: string; kind?: string; iv?: string; ct?: string }>(req);
  const id = typeof b?.id === "string" && UUID_RE.test(b.id) ? b.id : null;
  if (!b?.action || !id) return fail("Invalid request");
  const sql = db();
  const partnerId = await getPartnerId(me);
  let notice: { to: string | null; payload: PushPayload } | null = null;

  if (b.action === "start") {
    if (!partnerId) return fail("Games need two players. Invite your partner first.");
    if (b.kind !== "wyr" && b.kind !== "tot" && b.kind !== "know") return fail("Unknown game");
    if (!okCipher(b.iv, b.ct)) return fail("Invalid game");
    const open = await sql`select count(*)::int as n from games where space_id = ${me.spaceId} and finished_at is null`;
    if (open[0].n >= 10) return fail("Finish or remove a game before starting another.");
    await sql`
      insert into games (id, space_id, kind, created_by, subject, iv, ciphertext)
      values (${id}, ${me.spaceId}, ${b.kind}, ${me.memberId}, ${b.kind === "know" ? me.memberId : null}::uuid, ${b.iv as string}, ${b.ct as string})
      on conflict (id) do nothing`;
    notice = {
      to: partnerId,
      payload: b.kind === "know"
        ? { title: `🎲 How well do you know ${me.name}?`, body: `${me.name} made a quiz about ${pron(((await sql`select gender from members where id = ${me.memberId}`)[0]?.gender ?? null) as Gender).self}. Your turn to guess.`, tag: "game" }
        : { title: `🎲 ${me.name} wants to play ${TITLES[b.kind]}`, body: "Your turn. Answer and see how you match.", tag: "game" },
    };
  } else if (b.action === "answer") {
    if (!okCipher(b.iv, b.ct)) return fail("Invalid answers");
    const game = await sql`select kind, finished_at from games where id = ${id} and space_id = ${me.spaceId}`;
    if (!game[0]) return fail("That game is gone.", 404);
    // Answers are final: no changing them after seeing the other person's.
    const inserted = await sql`
      insert into game_answers (game_id, member_id, iv, ciphertext) values (${id}, ${me.memberId}, ${b.iv as string}, ${b.ct as string})
      on conflict do nothing returning game_id`;
    if (!inserted[0]) return fail("You've already answered this one.", 409);
    const count = await sql`select count(*)::int as n from game_answers where game_id = ${id}`;
    if (count[0].n >= 2) {
      await sql`update games set finished_at = now() where id = ${id} and finished_at is null`;
      notice = { to: partnerId, payload: { title: `🎲 ${me.name} finished ${TITLES[game[0].kind]}`, body: "See how you matched.", tag: "game" } };
    } else {
      notice = { to: partnerId, payload: { title: `🎲 ${me.name} answered ${TITLES[game[0].kind]}`, body: "Your turn. Then you'll both see the results.", tag: "game" } };
    }
  } else if (b.action === "delete") {
    await sql`delete from games where id = ${id} and space_id = ${me.spaceId}`;
  } else {
    return fail("Unknown action");
  }

  if (notice) {
    const n = notice;
    after(() => pushTo(n.to, n.payload));
  }
  return json({ ok: true });
}
