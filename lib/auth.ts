import { headers } from "next/headers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { ensureSchema, getD1 } from "../db";

export type AppUser = {
  email: string;
  displayName: string;
  isLocal: boolean;
};

export async function getCurrentUser(): Promise<AppUser | null> {
  const authenticated = await getChatGPTUser();
  if (authenticated) {
    return {
      email: authenticated.email.toLowerCase(),
      displayName: authenticated.displayName,
      isLocal: false,
    };
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return {
      email: "local-preview@brainstroming.ai",
      displayName: "Local Preview",
      isLocal: true,
    };
  }

  return null;
}

export async function requireApiUser(): Promise<AppUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  await ensureSchema();
  const db = getD1();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO users (email, display_name, plan, daily_limit, created_at, updated_at)
       VALUES (?, ?, 'free', 50, ?, ?)
       ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
    )
    .bind(user.email, user.displayName, now, now)
    .run();

  return user;
}

export function unauthorizedResponse() {
  return Response.json(
    {
      error: "Authentication required.",
      signInPath: "/signin-with-chatgpt?return_to=%2F",
    },
    { status: 401 },
  );
}
