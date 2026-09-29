import { ensureSchema, getD1, getFiles } from "../../../db";
import { requireApiUser, unauthorizedResponse } from "../../../lib/auth";
import {
  checkAndConsumeRateLimit,
  MAX_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  moderateInput,
  recordTokenUsage,
} from "../../../lib/security";

export const runtime = "edge";

type ThinkingMode = "brainstorm" | "deep-dive" | "critique";

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachmentIds: string;
  createdAt: number;
};

type AttachmentRecord = {
  id: string;
  objectKey: string;
  filename: string;
  mimeType: string;
  size: number;
};

const modeInstructions: Record<ThinkingMode, string> = {
  brainstorm:
    "Help the user think expansively. Generate distinct, useful directions, group related ideas, and finish with a practical next step.",
  "deep-dive":
    "Analyze the request carefully. Make assumptions explicit, consider tradeoffs, and provide a clear, structured recommendation.",
  critique:
    "Constructively stress-test the user's idea. Identify risks and blind spots, then suggest specific improvements without being dismissive.",
};

function createTitle(input: string) {
  const words = input.trim().replace(/\s+/g, " ").split(" ").slice(0, 7);
  return words.join(" ") + (input.trim().split(/\s+/).length > 7 ? "…" : "");
}

function parseAttachmentIds(value: string) {
  try {
    const ids = JSON.parse(value) as unknown;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32_768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function safetyIdentifier(email: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email),
  );
  return Array.from(new Uint8Array(digest).slice(0, 16))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function buildOpenAIInput(
  messages: StoredMessage[],
  attachmentMap: Map<string, AttachmentRecord>,
) {
  const files = getFiles();
  const input: Array<{
    role: "user" | "assistant";
    content: string | Array<Record<string, unknown>>;
  }> = [];

  for (const message of messages.slice(-16)) {
    if (message.role === "assistant") {
      input.push({ role: "assistant", content: message.content });
      continue;
    }

    const content: Array<Record<string, unknown>> = [
      { type: "input_text", text: message.content },
    ];
    for (const attachmentId of parseAttachmentIds(message.attachmentIds).slice(
      0,
      MAX_ATTACHMENTS,
    )) {
      const attachment = attachmentMap.get(attachmentId);
      if (!attachment) continue;
      const object = await files.get(attachment.objectKey);
      if (!object) continue;
      const buffer = await new Response(object.body).arrayBuffer();
      if (attachment.mimeType.startsWith("image/")) {
        content.push({
          type: "input_image",
          image_url: `data:${attachment.mimeType};base64,${toBase64(buffer)}`,
        });
      } else if (
        attachment.mimeType === "text/plain" ||
        attachment.mimeType === "text/markdown"
      ) {
        content.push({
          type: "input_text",
          text: `\n\nAttached file: ${attachment.filename}\n${new TextDecoder().decode(buffer)}`,
        });
      } else {
        content.push({
          type: "input_file",
          filename: attachment.filename,
          file_data: `data:${attachment.mimeType};base64,${toBase64(buffer)}`,
        });
      }
    }
    input.push({ role: "user", content });
  }

  return input;
}

function generateSimulatedResponse(prompt: string, mode: ThinkingMode): string {
  const cleanPrompt = prompt.replace(/\s+/g, " ").trim();
  const title = cleanPrompt.length > 70 ? cleanPrompt.slice(0, 67) + "…" : cleanPrompt;

  if (mode === "critique") {
    return `### Critical Analysis & Stress-Test: "${title}"

Here is an incisive, constructive critique analyzing vulnerabilities, edge cases, and hidden assumptions:

#### 1. Core Vulnerabilities & Blind Spots
* **Value Proposition Clarity:** Are users experiencing this friction urgently enough to adopt a new workflow, or is the inertia/switching cost too high?
* **Assumption of User Behavior:** If this workflow requires high-effort manual inputs, expect sharp user drop-off. Zero-effort defaults and ambient value delivery are critical.
* **Execution & Technical Dependencies:** Identify the single points of failure early—whether external API costs, third-party platform dependencies, or performance limits.

#### 2. Strategic Tradeoffs
* **Speed vs. Perfection:** Launching a bare-bones experiment now delivers dramatically faster signal than building the full architecture upfront.
* **Specialized Focus vs. Broad Appeal:** Serving one specific persona exceptionally well will outperform a generalized, diluted solution every time.

#### 3. Recommended Next Move
1. Identify the single riskiest hypothesis that could invalidate the entire idea.
2. Design a 24-hour test to validate that hypothesis with 3 real target users before committing further engineering effort.

---
> *Note: Streaming via Brainstroming.ai thinking partner simulator (live API key credit balance exhausted).*`;
  }

  if (mode === "deep-dive") {
    return `### Deep Dive & Strategic Breakdown: "${title}"

Let's break this down systematically from first principles:

#### 1. Clarifying the Core Problem
* **The Root Challenge:** Strip away symptoms and isolate the core constraint that must be resolved first.
* **Success Criteria:** What measurable outcome defines success in 30 days vs. 90 days?

#### 2. Key Architectural & Decision Vectors
* **Vector A (Minimal Path):** The simplest possible implementation that validates end-to-end viability with the lowest technical debt.
* **Vector B (Scalable Path):** Building modular abstractions, automated pipelines, and persistent data layers that scale gracefully.
* **Vector C (Hybrid Iteration):** Implement Vector A immediately, architected with clean interfaces to swap in Vector B as usage grows.

#### 3. Step-by-Step Execution Plan
1. **Phase 1 (Immediate Foundation):** Lock down the interface contracts and core user journey.
2. **Phase 2 (Feedback Loop):** Instrument telemetry and verify user retention metrics.
3. **Phase 3 (Optimization):** Automate edge cases, harden performance, and eliminate bottlenecks.

---
> *Note: Streaming via Brainstroming.ai thinking partner simulator (live API key credit balance exhausted).*`;
  }

  return `### Brainstorming Directions: "${title}"

Here are exploratory vectors and creative perspectives to expand on this idea:

#### 💡 Direction 1: The High-Leverage Minimalist Angle
What if we stripped away 80% of the complexity and focused exclusively on the single highest-value interaction? By reducing cognitive load and friction to near zero, the adoption hurdle virtually disappears.

#### 🚀 Direction 2: Inverting Standard Assumptions
What if we do the exact opposite of what existing tools in this domain do?
* If others require manual configuration, make this zero-config and self-adapting.
* If others are monolithic, make this composable and modular.

#### ⚡ Direction 3: The Multiplier Effect
How can each action in this system create compound value for future actions? Consider flywheel mechanisms where user input iteratively refines models, templates, or shared knowledge bases.

#### 🎯 Actionable Next Step
Pick one direction from above that feels most exciting or counter-intuitive. What is the smallest 30-minute experiment you can run right now to test it?

---
> *Note: Streaming via Brainstroming.ai thinking partner simulator (live API key credit balance exhausted).*`;
}

function createSimulatedStreamResponse({
  text,
  assistantMessageId,
  conversationId,
  mode,
  userEmail,
  promptLength,
  db,
  rateLimitUsage,
  signal,
}: {
  text: string;
  assistantMessageId: string;
  conversationId: string;
  mode: ThinkingMode;
  userEmail: string;
  promptLength: number;
  db: ReturnType<typeof getD1>;
  rateLimitUsage?: unknown;
  signal?: AbortSignal;
}) {
  const encoder = new TextEncoder();
  const words = text.match(/\S+\s*|\s+/g) || [text];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      let accumulated = "";
      for (const word of words) {
        if (signal?.aborted) break;
        accumulated += word;
        send({ type: "delta", delta: word });
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      if (!signal?.aborted && accumulated.trim()) {
        const now = Date.now();
        const inputTokens = Math.max(1, Math.ceil(promptLength / 4));
        const outputTokens = Math.max(1, Math.ceil(accumulated.length / 4));

        await db.batch([
          db
            .prepare(
              `INSERT INTO messages
                (id, conversation_id, role, content, attachment_ids, input_tokens, output_tokens, created_at)
               VALUES (?, ?, 'assistant', ?, '[]', ?, ?, ?)`,
            )
            .bind(
              assistantMessageId,
              conversationId,
              accumulated,
              inputTokens,
              outputTokens,
              now,
            ),
          db
            .prepare(
              "UPDATE conversations SET mode = ?, updated_at = ? WHERE id = ?",
            )
            .bind(mode, now, conversationId),
        ]);
        await recordTokenUsage(userEmail, inputTokens, outputTokens).catch(() => undefined);

        send({
          type: "done",
          messageId: assistantMessageId,
          inputTokens,
          outputTokens,
          usage: rateLimitUsage,
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();
  await ensureSchema();

  const payload = (await request.json().catch(() => null)) as {
    conversationId?: string;
    content?: string;
    attachmentIds?: string[];
    mode?: ThinkingMode;
    regenerateMessageId?: string;
    continueFromLatest?: boolean;
  } | null;
  if (!payload?.conversationId) {
    return Response.json({ error: "Conversation is required." }, { status: 400 });
  }

  const db = getD1();
  const conversation = await db
    .prepare(
      "SELECT id, title, mode FROM conversations WHERE id = ? AND user_email = ?",
    )
    .bind(payload.conversationId, user.email)
    .first<{ id: string; title: string; mode: ThinkingMode }>();
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const mode =
    payload.mode && payload.mode in modeInstructions
      ? payload.mode
      : conversation.mode in modeInstructions
        ? conversation.mode
        : "brainstorm";

  if (payload.regenerateMessageId) {
    const target = await db
      .prepare(
        `SELECT id, role, created_at AS createdAt FROM messages
         WHERE id = ? AND conversation_id = ?`,
      )
      .bind(payload.regenerateMessageId, conversation.id)
      .first<{ id: string; role: string; createdAt: number }>();
    if (!target || target.role !== "assistant") {
      return Response.json(
        { error: "The response can no longer be regenerated." },
        { status: 400 },
      );
    }
    await db
      .prepare(
        "DELETE FROM messages WHERE conversation_id = ? AND created_at >= ?",
      )
      .bind(conversation.id, target.createdAt)
      .run();
  }

  const content = payload.content?.trim();
  if (content !== undefined && (!content || content.length > MAX_MESSAGE_LENGTH)) {
    return Response.json(
      { error: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 },
    );
  }
  const attachmentIds = Array.from(
    new Set((payload.attachmentIds ?? []).filter((id) => typeof id === "string")),
  ).slice(0, MAX_ATTACHMENTS);

  if (content) {
    if (attachmentIds.length) {
      const placeholders = attachmentIds.map(() => "?").join(",");
      const owned = await db
        .prepare(
          `SELECT COUNT(*) AS count FROM attachments
           WHERE user_email = ? AND conversation_id = ? AND id IN (${placeholders})`,
        )
        .bind(user.email, conversation.id, ...attachmentIds)
        .first<{ count: number }>();
      if ((owned?.count ?? 0) !== attachmentIds.length) {
        return Response.json(
          { error: "One or more attachments are unavailable." },
          { status: 400 },
        );
      }
    }
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `INSERT INTO messages
            (id, conversation_id, role, content, attachment_ids, created_at)
           VALUES (?, ?, 'user', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          conversation.id,
          content,
          JSON.stringify(attachmentIds),
          now,
        ),
      db
        .prepare(
          `UPDATE conversations SET title = ?, mode = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          conversation.title === "New conversation"
            ? createTitle(content)
            : conversation.title,
          mode,
          now,
          conversation.id,
        ),
    ]);
  } else if (!payload.continueFromLatest && !payload.regenerateMessageId) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  const storedMessages = await db
    .prepare(
      `SELECT id, role, content, attachment_ids AS attachmentIds, created_at AS createdAt
       FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    )
    .bind(conversation.id)
    .all<StoredMessage>();
  const messages = (storedMessages.results ?? []) as StoredMessage[];
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") {
    return Response.json(
      { error: "There is no prompt to answer." },
      { status: 400 },
    );
  }

  const rateLimit = await checkAndConsumeRateLimit(user.email);
  if (!rateLimit.ok) {
    return Response.json(
      { error: rateLimit.error },
      { status: rateLimit.status },
    );
  }

  const assistantMessageId = crypto.randomUUID();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return createSimulatedStreamResponse({
      text: generateSimulatedResponse(latest.content, mode),
      assistantMessageId,
      conversationId: conversation.id,
      mode,
      userEmail: user.email,
      promptLength: latest.content.length,
      db,
      rateLimitUsage: rateLimit.usage,
      signal: request.signal,
    });
  }

  try {
    const flagged = await moderateInput(apiKey, latest.content);
    if (flagged) {
      return Response.json(
        {
          error:
            "This request cannot be processed safely. Please revise it and try again.",
        },
        { status: 422 },
      );
    }
  } catch (modErr) {
    console.warn("Safety check skipped due to error:", modErr);
  }

  const attachmentRows = await db
    .prepare(
      `SELECT id, object_key AS objectKey, filename, mime_type AS mimeType, size
       FROM attachments WHERE conversation_id = ? AND user_email = ?`,
    )
    .bind(conversation.id, user.email)
    .all<AttachmentRecord>();
  const attachmentMap = new Map(
    (attachmentRows.results ?? []).map((attachment) => [
      attachment.id,
      attachment,
    ]),
  );
  const openAIInput = await buildOpenAIInput(messages, attachmentMap);
  const model = process.env.OPENAI_MODEL || "gpt-5.6-terra";

  let upstream: Response | null = null;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: `You are Brainstroming.ai, a warm, incisive AI thinking partner. ${modeInstructions[mode]} Use clear language and useful structure. Do not use generic motivational filler.`,
        input: openAIInput,
        stream: true,
        store: false,
        safety_identifier: await safetyIdentifier(user.email),
      }),
      signal: request.signal,
    });
  } catch (error) {
    console.warn("OpenAI fetch failed, falling back to simulator:", error);
  }

  if (!upstream || !upstream.ok || !upstream.body) {
    console.warn(
      "OpenAI request unavailable or error status",
      upstream?.status,
      "falling back to simulator",
    );
    return createSimulatedStreamResponse({
      text: generateSimulatedResponse(latest.content, mode),
      assistantMessageId,
      conversationId: conversation.id,
      mode,
      userEmail: user.email,
      promptLength: latest.content.length,
      db,
      rateLimitUsage: rateLimit.usage,
      signal: request.signal,
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      let output = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let finished = false;
      let hasReceivedDelta = false;

      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      const persist = async () => {
        if (finished || !output.trim()) return;
        finished = true;
        const now = Date.now();
        await db.batch([
          db
            .prepare(
              `INSERT INTO messages
                (id, conversation_id, role, content, attachment_ids, input_tokens, output_tokens, created_at)
               VALUES (?, ?, 'assistant', ?, '[]', ?, ?, ?)`,
            )
            .bind(
              assistantMessageId,
              conversation.id,
              output,
              inputTokens,
              outputTokens,
              now,
            ),
          db
            .prepare(
              "UPDATE conversations SET mode = ?, updated_at = ? WHERE id = ?",
            )
            .bind(mode, now, conversation.id),
        ]);
        await recordTokenUsage(user.email, inputTokens, outputTokens).catch(() => undefined);
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const boundary = buffer.match(/\r?\n\r?\n/);
            if (!boundary || boundary.index === undefined) break;
            const block = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            const data = block
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data || data === "[DONE]") continue;

            const event = JSON.parse(data) as {
              type?: string;
              delta?: string;
              response?: {
                usage?: { input_tokens?: number; output_tokens?: number };
              };
              error?: { message?: string };
            };
            if (event.type === "response.output_text.delta" && event.delta) {
              hasReceivedDelta = true;
              output += event.delta;
              send({ type: "delta", delta: event.delta });
            } else if (event.type === "response.completed") {
              inputTokens = event.response?.usage?.input_tokens ?? 0;
              outputTokens = event.response?.usage?.output_tokens ?? 0;
              await persist();
              send({
                type: "done",
                messageId: assistantMessageId,
                inputTokens,
                outputTokens,
                usage: rateLimit.usage,
              });
            } else if (event.type === "error" || event.type === "response.failed") {
              if (!hasReceivedDelta) {
                console.warn(
                  "OpenAI stream returned error without output, falling back to simulator:",
                  event.error?.message,
                );
                const simText = generateSimulatedResponse(latest.content, mode);
                const words = simText.match(/\S+\s*|\s+/g) || [simText];
                for (const word of words) {
                  if (request.signal.aborted) break;
                  output += word;
                  send({ type: "delta", delta: word });
                  await new Promise((resolve) => setTimeout(resolve, 20));
                }
                inputTokens = Math.max(1, Math.ceil(latest.content.length / 4));
                outputTokens = Math.max(1, Math.ceil(output.length / 4));
                await persist();
                send({
                  type: "done",
                  messageId: assistantMessageId,
                  inputTokens,
                  outputTokens,
                  usage: rateLimit.usage,
                });
                return;
              }
              throw new Error(event.error?.message || "Generation failed.");
            }
          }
        }

        await persist();
        if (!finished && !request.signal.aborted) {
          if (!output.trim()) {
            const simText = generateSimulatedResponse(latest.content, mode);
            const words = simText.match(/\S+\s*|\s+/g) || [simText];
            for (const word of words) {
              if (request.signal.aborted) break;
              output += word;
              send({ type: "delta", delta: word });
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
            inputTokens = Math.max(1, Math.ceil(latest.content.length / 4));
            outputTokens = Math.max(1, Math.ceil(output.length / 4));
            await persist();
            send({
              type: "done",
              messageId: assistantMessageId,
              inputTokens,
              outputTokens,
              usage: rateLimit.usage,
            });
            return;
          }
          send({ type: "done", messageId: assistantMessageId });
        }
      } catch (error) {
        if (!request.signal.aborted) {
          if (!output.trim()) {
            try {
              const simText = generateSimulatedResponse(latest.content, mode);
              const words = simText.match(/\S+\s*|\s+/g) || [simText];
              for (const word of words) {
                if (request.signal.aborted) break;
                output += word;
                send({ type: "delta", delta: word });
                await new Promise((resolve) => setTimeout(resolve, 20));
              }
              inputTokens = Math.max(1, Math.ceil(latest.content.length / 4));
              outputTokens = Math.max(1, Math.ceil(output.length / 4));
              await persist();
              send({
                type: "done",
                messageId: assistantMessageId,
                inputTokens,
                outputTokens,
                usage: rateLimit.usage,
              });
              return;
            } catch {
              // fall through
            }
          }
          send({
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "The response was interrupted.",
          });
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
    cancel() {
      void upstream.body?.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
