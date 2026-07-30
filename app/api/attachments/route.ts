import { ensureSchema, getD1, getFiles } from "../../../db";
import { requireApiUser, unauthorizedResponse } from "../../../lib/auth";
import {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
} from "../../../lib/security";

const allowedTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function safeFilename(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .slice(0, 120);
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  await ensureSchema();

  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "");
  const file = form.get("file");
  if (!conversationId || !(file instanceof File)) {
    return Response.json(
      { error: "A conversation and file are required." },
      { status: 400 },
    );
  }
  if (!allowedTypes.has(file.type)) {
    return Response.json(
      { error: "Use a PDF, text, Markdown, PNG, JPEG, or WebP file." },
      { status: 415 },
    );
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: "Files must be smaller than 5 MB." },
      { status: 413 },
    );
  }

  const db = getD1();
  const [conversation, countRow] = await Promise.all([
    db
      .prepare("SELECT id FROM conversations WHERE id = ? AND user_email = ?")
      .bind(conversationId, user.email)
      .first(),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM attachments WHERE conversation_id = ? AND user_email = ?",
      )
      .bind(conversationId, user.email)
      .first<{ count: number }>(),
  ]);
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  if ((countRow?.count ?? 0) >= MAX_ATTACHMENTS * 8) {
    return Response.json(
      { error: "This conversation has reached its attachment limit." },
      { status: 429 },
    );
  }

  const id = crypto.randomUUID();
  const filename = safeFilename(file.name || "attachment");
  const objectKey = `${encodeURIComponent(user.email)}/${conversationId}/${id}-${filename}`;
  const bytes = await file.arrayBuffer();
  await getFiles().put(objectKey, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      userEmail: user.email,
      conversationId,
      filename,
    },
  });
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO attachments
        (id, user_email, conversation_id, object_key, filename, mime_type, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      user.email,
      conversationId,
      objectKey,
      filename,
      file.type,
      file.size,
      now,
    )
    .run();

  return Response.json(
    {
      attachment: {
        id,
        conversationId,
        filename,
        mimeType: file.type,
        size: file.size,
        createdAt: now,
      },
    },
    { status: 201 },
  );
}
