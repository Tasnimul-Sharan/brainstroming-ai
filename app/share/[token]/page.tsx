import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureSchema, getD1 } from "../../../db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared conversation — Brainstroming.ai",
  description: "A conversation shared from Brainstroming.ai.",
  robots: { index: false, follow: false },
};

export default async function SharedConversation({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await ensureSchema();
  const { token } = await params;
  const db = getD1();
  const conversation = await db
    .prepare(
      `SELECT id, title, mode, updated_at AS updatedAt
       FROM conversations WHERE share_token = ?`,
    )
    .bind(token)
    .first<{ id: string; title: string; mode: string; updatedAt: number }>();
  if (!conversation) notFound();

  const result = await db
    .prepare(
      `SELECT id, role, content, created_at AS createdAt
       FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    )
    .bind(conversation.id)
    .all<{ id: string; role: string; content: string; createdAt: number }>();

  return (
    <main className="shared-page">
      <header className="shared-header">
        <Link href="/" className="shared-brand">
          Brainstroming<span>.ai</span>
        </Link>
        <Link href="/" className="shared-cta">Start your own conversation</Link>
      </header>
      <article className="shared-card">
        <p className="shared-kicker">{conversation.mode.replace("-", " ")} session</p>
        <h1>{conversation.title}</h1>
        <div className="shared-messages">
          {(result.results ?? []).map((message) => (
            <section className={`shared-message ${message.role}`} key={message.id}>
              <strong>{message.role === "assistant" ? "Brainstroming.ai" : "Prompt"}</strong>
              <div>{message.content}</div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
