import { ensureSchema, getD1, getFiles } from "../../../../db";
import { requireApiUser, unauthorizedResponse } from "../../../../lib/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await context.params;
  const db = getD1();
  const attachment = await db
    .prepare(
      `SELECT object_key AS objectKey, filename, mime_type AS mimeType
       FROM attachments WHERE id = ? AND user_email = ?`,
    )
    .bind(id, user.email)
    .first<{ objectKey: string; filename: string; mimeType: string }>();
  if (!attachment) {
    return Response.json({ error: "Attachment not found." }, { status: 404 });
  }
  const object = await getFiles().get(attachment.objectKey);
  if (!object) {
    return Response.json({ error: "Stored file not found." }, { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  await ensureSchema();
  const { id } = await context.params;
  const db = getD1();
  const attachment = await db
    .prepare(
      "SELECT object_key AS objectKey FROM attachments WHERE id = ? AND user_email = ?",
    )
    .bind(id, user.email)
    .first<{ objectKey: string }>();
  if (!attachment) {
    return Response.json({ error: "Attachment not found." }, { status: 404 });
  }
  await Promise.all([
    getFiles().delete(attachment.objectKey),
    db
      .prepare("DELETE FROM attachments WHERE id = ? AND user_email = ?")
      .bind(id, user.email)
      .run(),
  ]);
  return new Response(null, { status: 204 });
}
