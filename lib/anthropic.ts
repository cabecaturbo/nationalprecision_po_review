// Server-side Anthropic helper. This file must never be imported by client
// components — it reads ANTHROPIC_API_KEY, which stays on the server.

// MODEL: the build spec asked for `claude-sonnet-4-6`, which is not a valid
// Anthropic model id (it returns HTTP 404). Using the current Sonnet id so live
// calls work. This single constant swaps the model for both routes — revert to
// "claude-sonnet-4-6" here if you specifically need that string.
export const MODEL = "claude-sonnet-5";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicBlock = { type: string; text?: string };

/**
 * Calls the Anthropic Messages API and returns the concatenated text blocks.
 * Throws with the real upstream status + body on failure so callers can surface
 * a meaningful error instead of a generic one.
 */
export async function anthropicMessages(
  body: Record<string, unknown>,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set on the server. Add it to .env.local for local dev, or to the Vercel project's Environment Variables when deployed.",
    );
  }

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({ model: MODEL, ...body }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Couldn't reach the Anthropic API from the server (${msg}).`);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new Error(`Anthropic API returned ${res.status}. ${detail}`.trim());
  }

  const data = (await res.json()) as { content?: AnthropicBlock[] };
  const blocks = data.content ?? [];
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}
