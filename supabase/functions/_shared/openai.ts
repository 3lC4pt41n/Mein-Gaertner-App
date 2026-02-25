// Shared OpenAI Helper für alle Edge Functions

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// GPT-4o Preise (Stand Feb 2026 – ggf. anpassen)
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.50 / 1_000_000, output: 10.0 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
};

export interface OpenAIResponse {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  model: string;
}

export async function callOpenAI(params: {
  messages: any[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
}): Promise<OpenAIResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY nicht konfiguriert");

  const model = params.model || "gpt-4o";

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      max_tokens: params.max_tokens || 1500,
      temperature: params.temperature ?? 0.3,
    }),
  });

  const json = await res.json();

  if (json.error) {
    throw new Error(`OpenAI Error: ${json.error.message}`);
  }

  const usage = json.usage || {};
  const prompt_tokens = usage.prompt_tokens || 0;
  const completion_tokens = usage.completion_tokens || 0;
  const total_tokens = prompt_tokens + completion_tokens;

  const pricing = PRICING[model] || PRICING["gpt-4o"];
  const cost_usd =
    prompt_tokens * pricing.input + completion_tokens * pricing.output;

  return {
    content: json.choices?.[0]?.message?.content || "",
    prompt_tokens,
    completion_tokens,
    total_tokens,
    cost_usd,
    model,
  };
}
