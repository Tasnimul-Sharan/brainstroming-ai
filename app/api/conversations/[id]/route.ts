import { ensureSchema, getD1, getFiles } from "../../../../db";
import { requireApiUser, unauthorizedResponse } from "../../../../lib/auth";

async function ownedConversation(id: string, email: string) {
  const db = getD1();
  return db
    .prepare(
      `SELECT id, title, mode, share_token AS shareToken,
              created_at AS createdAt, updated_at AS updatedAt
       FROM conversations WHERE id = ? AND user_email = ?`,
    )
    .bind(id, email)
    .first<Record<string, unknown>>();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await context.params;
  const conversation = await ownedConversation(id, user.email);
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const db = getD1();
  const [messageRows, attachmentRows] = await Promise.all([
    db
      .prepare(
        `SELECT id, role, content, attachment_ids AS attachmentIds,
                input_tokens AS inputTokens, output_tokens AS outputTokens,
                feedback, created_at AS createdAt, edited_at AS editedAt
         FROM messages WHERE conversation_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, filename, mime_type AS mimeType, size, created_at AS createdAt
         FROM attachments WHERE conversation_id = ? AND user_email = ?
         ORDER BY created_at ASC`,
      )
      .bind(id, user.email)
      .all<Record<string, unknown>>(),
  ]);

  const attachments = attachmentRows.results ?? [];
  const attachmentById = new Map(
    attachments.map((attachment) => [String(attachment.id), attachment]),
  );
  const messages = (messageRows.results ?? []).map((message) => {
    let ids: string[] = [];
    try {
      ids = JSON.parse(String(message.attachmentIds ?? "[]")) as string[];
    } catch {
      ids = [];
    }
    return {
      ...message,
      attachments: ids
        .map((attachmentId) => attachmentById.get(attachmentId))
        .filter(Boolean),
    };
  });

  return Response.json({ conversation, messages, attachments });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;
  const conversation = await ownedConversation(id, user.email);
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const payload = (await request.json()) as {
    title?: string;
    mode?: string;
    sharing?: boolean;
  };
  const validModes = new Set(["brainstorm", "deep-dive", "critique"]);
  const title =
    typeof payload.title === "string"
      ? payload.title.trim().slice(0, 120) || "Untitled conversation"
      : String(conversation.title);
  const mode = validModes.has(payload.mode ?? "")
    ? payload.mode!
    : String(conversation.mode);
  const shareToken =
    payload.sharing === true
      ? String(conversation.shareToken ?? crypto.randomUUID().replaceAll("-", ""))
      : payload.sharing === false
        ? null
        : (conversation.shareToken as string | null);

  const db = getD1();
  const now = Date.now();
  await db
    .prepare(
      `UPDATE conversations
       SET title = ?, mode = ?, share_token = ?, updated_at = ?
       WHERE id = ? AND user_email = ?`,
    )
    .bind(title, mode, shareToken, now, id, user.email)
    .run();

  const shareUrl = shareToken
    ? new URL(`/share/${shareToken}`, request.url).toString()
    : null;
  return Response.json({
    conversation: { ...conversation, title, mode, shareToken, updatedAt: now },
    shareUrl,
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;
  const conversation = await ownedConversation(id, user.email);
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const db = getD1();
  const attachmentRows = await db
    .prepare(
      "SELECT object_key AS objectKey FROM attachments WHERE conversation_id = ? AND user_email = ?",
    )
    .bind(id, user.email)
    .all<{ objectKey: string }>();
  const files = getFiles();
  await Promise.all(
    (attachmentRows.results ?? []).map((attachment) =>
      files.delete(attachment.objectKey),
    ),
  );
  await db
    .prepare("DELETE FROM conversations WHERE id = ? AND user_email = ?")
    .bind(id, user.email)
    .run();

  return new Response(null, { status: 204 });
}
