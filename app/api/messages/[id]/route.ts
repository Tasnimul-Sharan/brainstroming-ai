import { ensureSchema, getD1 } from "../../../../db";
import { requireApiUser, unauthorizedResponse } from "../../../../lib/auth";
import { MAX_MESSAGE_LENGTH } from "../../../../lib/security";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await context.params;
  const payload = (await request.json()) as {
    content?: string;
    feedback?: "up" | "down" | null;
  };

  const db = getD1();
  const message = await db
    .prepare(
      `SELECT m.id, m.role, m.content, m.created_at AS createdAt,
              m.conversation_id AS conversationId
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = ? AND c.user_email = ?`,
    )
    .bind(id, user.email)
    .first<{
      id: string;
      role: string;
      content: string;
      createdAt: number;
      conversationId: string;
    }>();
  if (!message) {
    return Response.json({ error: "Message not found." }, { status: 404 });
  }

  const now = Date.now();
  if (payload.content !== undefined) {
    if (message.role !== "user") {
      return Response.json(
        { error: "Only your own prompts can be edited." },
        { status: 400 },
      );
    }
    const content = payload.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      return Response.json(
        { error: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 },
      );
    }
    await db.batch([
      db
        .prepare("UPDATE messages SET content = ?, edited_at = ? WHERE id = ?")
        .bind(content, now, id),
      db
        .prepare(
          "DELETE FROM messages WHERE conversation_id = ? AND created_at > ?",
        )
        .bind(message.conversationId, message.createdAt),
      db
        .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
        .bind(now, message.conversationId),
    ]);
    return Response.json({
      message: { ...message, content, editedAt: now },
      truncatedAfterEdit: true,
    });
  }

  if (
    payload.feedback !== undefined &&
    (payload.feedback === "up" ||
      payload.feedback === "down" ||
      payload.feedback === null)
  ) {
    if (message.role !== "assistant") {
      return Response.json(
        { error: "Feedback is only available for AI responses." },
        { status: 400 },
      );
    }
    await db
      .prepare("UPDATE messages SET feedback = ? WHERE id = ?")
      .bind(payload.feedback, id)
      .run();
    return Response.json({
      message: { ...message, feedback: payload.feedback },
    });
  }

  return Response.json({ error: "No valid update was supplied." }, { status: 400 });
}
