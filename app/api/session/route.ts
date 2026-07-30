import { requireApiUser, unauthorizedResponse } from "../../../lib/auth";
import { getUsage } from "../../../lib/security";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorizedResponse();

  const usage = await getUsage(user.email);
  return Response.json({
    user,
    usage,
    apiConfigured: Boolean(process.env.OPENAI_API_KEY),
    signOutPath: "/signout-with-chatgpt?return_to=%2F",
  });
}
