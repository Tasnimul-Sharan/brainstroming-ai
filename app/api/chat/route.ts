export const runtime = "edge";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ThinkingMode = "brainstorm" | "deep-dive" | "critique";

const modeInstructions: Record<ThinkingMode, string> = {
  brainstorm:
    "Help the user think expansively. Generate distinct, useful directions, group related ideas, and finish with a practical next step.",
  "deep-dive":
    "Analyze the request carefully. Make assumptions explicit, consider tradeoffs, and provide a clear, structured recommendation.",
  critique:
    "Constructively stress-test the user's idea. Identify risks and blind spots, then suggest specific improvements without being dismissive.",
};

function demoResponse(prompt: string, mode: ThinkingMode) {
  const subject = prompt.replace(/\s+/g, " ").trim().slice(0, 140);

  if (mode === "critique") {
    return `Here’s a useful stress test for “${subject}”:

1. **Demand risk** — What evidence shows people want this badly enough to change their current behavior?
2. **Focus risk** — Which single user and painful moment will you serve first?
3. **Defensibility risk** — What gets stronger as more people use the product?

A strong next move is to write a one-sentence promise, interview five target users, and test the riskiest assumption before building more.

This response is running in demo mode. Add an OpenAI API key to unlock full AI answers.`;
  }

  if (mode === "deep-dive") {
    return `Let’s turn “${subject}” into a clearer plan.

**What matters most**
• Define the exact outcome you want.
• Separate facts from assumptions.
• Find the constraint that could make the rest irrelevant.

**A practical approach**
1. Write the problem in one sentence.
2. List three possible directions.
3. Compare them by impact, effort, and reversibility.
4. Run the smallest test that produces real evidence.

Start by telling me who this is for and what success would look like in 30 days.

This response is running in demo mode. Add an OpenAI API key to unlock full AI answers.`;
  }

  return `Let’s open this up: “${subject}”

**Three directions to explore**
1. **Make it simpler** — What is the smallest version that still creates a meaningful result?
2. **Make it surprising** — What would the opposite of the usual solution look like?
3. **Make it useful now** — What could someone try today without new tools or a large budget?

My favorite starting point is the first direction: define one person, one problem, and one outcome. From there, generate ten options quickly and score them for usefulness, originality, and ease of testing.

This response is running in demo mode. Add an OpenAI API key to unlock full AI answers.`;
}

function extractText(response: {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}) {
  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      mode?: ThinkingMode;
    };
    const messages = (body.messages ?? []).slice(-16);
    const mode: ThinkingMode =
      body.mode && body.mode in modeInstructions ? body.mode : "brainstorm";
    const lastPrompt = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.content;

    if (!lastPrompt?.trim()) {
      return Response.json({ error: "A message is required." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({
        text: demoResponse(lastPrompt, mode),
        demo: true,
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
        instructions: `You are Brainstroming.ai, a warm, incisive AI thinking partner. ${modeInstructions[mode]} Use clear language and useful structure. Do not use generic motivational filler.`,
        input: messages,
        store: false,
      }),
    });

    if (!response.ok) {
      return Response.json(
        { error: "The AI service is temporarily unavailable." },
        { status: 502 },
      );
    }

    const data = (await response.json()) as Parameters<typeof extractText>[0];
    const text = extractText(data);
    if (!text) {
      return Response.json(
        { error: "The AI returned an empty response." },
        { status: 502 },
      );
    }

    return Response.json({ text, demo: false });
  } catch {
    return Response.json(
      { error: "The request could not be processed." },
      { status: 400 },
    );
  }
}
