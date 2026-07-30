import { ensureSchema, getD1 } from "../../../db";
import { requireApiUser, unauthorizedResponse } from "../../../lib/auth";

const validModes = new Set(["brainstorm", "deep-dive", "critique"]);

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  await ensureSchema();

  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120);
  const db = getD1();
  const statement = query
    ? db
        .prepare(
          `SELECT c.id, c.title, c.mode, c.share_token AS shareToken,
                  c.created_at AS createdAt, c.updated_at AS updatedAt,
                  COUNT(m.id) AS messageCount
           FROM conversations c
           LEFT JOIN messages m ON m.conversation_id = c.id
           WHERE c.user_email = ? AND c.title LIKE ?
           GROUP BY c.id
           ORDER BY c.updated_at DESC
           LIMIT 50`,
        )
        .bind(user.email, `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`)
    : db
        .prepare(
          `SELECT c.id, c.title, c.mode, c.share_token AS shareToken,
                  c.created_at AS createdAt, c.updated_at AS updatedAt,
                  COUNT(m.id) AS messageCount
           FROM conversations c
           LEFT JOIN messages m ON m.conversation_id = c.id
           WHERE c.user_email = ?
           GROUP BY c.id
           ORDER BY c.updated_at DESC
           LIMIT 50`,
        )
        .bind(user.email);

  const result = await statement.all();
  return Response.json({ conversations: result.results ?? [] });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();

  const payload = (await request.json().catch(() => ({}))) as {
    title?: string;
    mode?: string;
  };
  const now = Date.now();
  const conversation = {
    id: crypto.randomUUID(),
    title: payload.title?.trim().slice(0, 120) || "New conversation",
    mode: validModes.has(payload.mode ?? "") ? payload.mode! : "brainstorm",
    createdAt: now,
    updatedAt: now,
  };

  const db = getD1();
  await db
    .prepare(
      `INSERT INTO conversations (id, user_email, title, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      conversation.id,
      user.email,
      conversation.title,
      conversation.mode,
      now,
      now,
    )
    .run();

  return Response.json(
    { conversation: { ...conversation, messageCount: 0, shareToken: null } },
    { status: 201 },
  );
}
