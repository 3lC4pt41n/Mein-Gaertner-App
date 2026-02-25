// Shared OpenAI Helper für alle Edge Functions

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";

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

export interface OpenAIImageEditResponse {
  image_bytes: Uint8Array;
  model: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

export async function callOpenAIImageEdit(params: {
  image_base64: string;
  prompt: string;
  model?: string;
  size?: "512x512" | "1024x1024";
}): Promise<OpenAIImageEditResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY nicht konfiguriert");

  const model = params.model || "gpt-image-1";
  const imageBytes = base64ToBytes(params.image_base64);
  const file = new File([imageBytes], "user-photo.jpg", { type: "image/jpeg" });

  const formData = new FormData();
  formData.append("model", model);
  formData.append("prompt", params.prompt);
  formData.append("size", params.size || "1024x1024");
  formData.append("response_format", "b64_json");
  formData.append("image", file);

  const res = await fetch(OPENAI_IMAGE_EDIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const json = await res.json();

  if (json.error) {
    throw new Error(`OpenAI Error: ${json.error.message}`);
  }

  const outputBase64 = json.data?.[0]?.b64_json;
  if (!outputBase64) {
    throw new Error("OpenAI Error: Kein Avatar-Bild erhalten");
  }

  return {
    image_bytes: base64ToBytes(outputBase64),
    model,
  };
}
