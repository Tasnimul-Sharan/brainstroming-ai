import { ensureSchema, getD1, getFiles } from "../../../db";
import { requireApiUser, unauthorizedResponse } from "../../../lib/auth";
import { getUsage } from "../../../lib/security";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  await ensureSchema();
  const db = getD1();
  const [conversations, messages, attachments, usage] = await Promise.all([
    db
      .prepare(
        `SELECT id, title, mode, created_at AS createdAt, updated_at AS updatedAt
         FROM conversations WHERE user_email = ? ORDER BY updated_at DESC`,
      )
      .bind(user.email)
      .all(),
    db
      .prepare(
        `SELECT m.id, m.conversation_id AS conversationId, m.role, m.content,
                m.attachment_ids AS attachmentIds, m.feedback,
                m.created_at AS createdAt, m.edited_at AS editedAt
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_email = ? ORDER BY m.created_at ASC`,
      )
      .bind(user.email)
      .all(),
    db
      .prepare(
        `SELECT id, conversation_id AS conversationId, filename,
                mime_type AS mimeType, size, created_at AS createdAt
         FROM attachments WHERE user_email = ? ORDER BY created_at ASC`,
      )
      .bind(user.email)
      .all(),
    getUsage(user.email),
  ]);

  return Response.json(
    {
      exportedAt: new Date().toISOString(),
      user,
      usage,
      conversations: conversations.results ?? [],
      messages: messages.results ?? [],
      attachments: attachments.results ?? [],
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="brainstroming-export-${Date.now()}.json"`,
      },
    },
  );
}

export async function DELETE() {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  await ensureSchema();
  const db = getD1();
  const attachmentRows = await db
    .prepare("SELECT object_key AS objectKey FROM attachments WHERE user_email = ?")
    .bind(user.email)
    .all<{ objectKey: string }>();
  const files = getFiles();
  await Promise.all(
    (attachmentRows.results ?? []).map((attachment) =>
      files.delete(attachment.objectKey),
    ),
  );
  await db
    .prepare("DELETE FROM users WHERE email = ?")
    .bind(user.email)
    .run();
  return new Response(null, { status: 204 });
}
