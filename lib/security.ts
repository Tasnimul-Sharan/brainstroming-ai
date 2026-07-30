import { ensureSchema, getD1 } from "../db";

export const MAX_MESSAGE_LENGTH = 12_000;
export const MAX_ATTACHMENTS = 3;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MINUTE_LIMIT = 10;

export type UsageSnapshot = {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
  dailyLimit: number;
};

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function checkAndConsumeRateLimit(
  userEmail: string,
): Promise<{ ok: true; usage: UsageSnapshot } | { ok: false; status: number; error: string }> {
  await ensureSchema();
  const db = getD1();
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  const today = todayUtc();

  const [minuteRow, userRow, usageRow] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM rate_events WHERE user_email = ? AND created_at >= ?",
      )
      .bind(userEmail, oneMinuteAgo)
      .first<{ count: number }>(),
    db
      .prepare("SELECT daily_limit AS dailyLimit FROM users WHERE email = ?")
      .bind(userEmail)
      .first<{ dailyLimit: number }>(),
    db
      .prepare(
        `SELECT request_count AS requestCount, input_tokens AS inputTokens,
                output_tokens AS outputTokens, estimated_cost_micros AS estimatedCostMicros
         FROM daily_usage WHERE user_email = ? AND usage_date = ?`,
      )
      .bind(userEmail, today)
      .first<{
        requestCount: number;
        inputTokens: number;
        outputTokens: number;
        estimatedCostMicros: number;
      }>(),
  ]);

  if ((minuteRow?.count ?? 0) >= MINUTE_LIMIT) {
    return {
      ok: false,
      status: 429,
      error: "Too many requests. Please wait a minute and try again.",
    };
  }

  const dailyLimit = userRow?.dailyLimit ?? 50;
  if ((usageRow?.requestCount ?? 0) >= dailyLimit) {
    return {
      ok: false,
      status: 429,
      error: "Your daily message limit has been reached.",
    };
  }

  const usageId = `${userEmail}:${today}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO rate_events (id, user_email, created_at) VALUES (?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), userEmail, now),
    db
      .prepare(
        `INSERT INTO daily_usage
          (id, user_email, usage_date, request_count, input_tokens, output_tokens, estimated_cost_micros, updated_at)
         VALUES (?, ?, ?, 1, 0, 0, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           request_count = request_count + 1,
           updated_at = excluded.updated_at`,
      )
      .bind(usageId, userEmail, today, now),
    db.prepare("DELETE FROM rate_events WHERE created_at < ?").bind(now - 86_400_000),
  ]);

  return {
    ok: true,
    usage: {
      requestCount: (usageRow?.requestCount ?? 0) + 1,
      inputTokens: usageRow?.inputTokens ?? 0,
      outputTokens: usageRow?.outputTokens ?? 0,
      estimatedCostMicros: usageRow?.estimatedCostMicros ?? 0,
      dailyLimit,
    },
  };
}

export async function recordTokenUsage(
  userEmail: string,
  inputTokens: number,
  outputTokens: number,
) {
  const inputPrice = Number(process.env.OPENAI_INPUT_PRICE_USD_PER_MILLION ?? "0");
  const outputPrice = Number(process.env.OPENAI_OUTPUT_PRICE_USD_PER_MILLION ?? "0");
  const estimatedCostMicros = Math.max(
    0,
    Math.round(inputTokens * inputPrice + outputTokens * outputPrice),
  );
  const db = getD1();
  await db
    .prepare(
      `UPDATE daily_usage SET
        input_tokens = input_tokens + ?,
        output_tokens = output_tokens + ?,
        estimated_cost_micros = estimated_cost_micros + ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      inputTokens,
      outputTokens,
      estimatedCostMicros,
      Date.now(),
      `${userEmail}:${todayUtc()}`,
    )
    .run();
}

export async function getUsage(userEmail: string): Promise<UsageSnapshot> {
  await ensureSchema();
  const db = getD1();
  const today = todayUtc();
  const [user, usage] = await Promise.all([
    db
      .prepare("SELECT daily_limit AS dailyLimit FROM users WHERE email = ?")
      .bind(userEmail)
      .first<{ dailyLimit: number }>(),
    db
      .prepare(
        `SELECT request_count AS requestCount, input_tokens AS inputTokens,
                output_tokens AS outputTokens, estimated_cost_micros AS estimatedCostMicros
         FROM daily_usage WHERE user_email = ? AND usage_date = ?`,
      )
      .bind(userEmail, today)
      .first<{
        requestCount: number;
        inputTokens: number;
        outputTokens: number;
        estimatedCostMicros: number;
      }>(),
  ]);

  return {
    requestCount: usage?.requestCount ?? 0,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    estimatedCostMicros: usage?.estimatedCostMicros ?? 0,
    dailyLimit: user?.dailyLimit ?? 50,
  };
}

export async function moderateInput(apiKey: string, text: string) {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error("Safety check could not be completed.");
  }

  const result = (await response.json()) as {
    results?: Array<{ flagged?: boolean }>;
  };
  return Boolean(result.results?.[0]?.flagged);
}
