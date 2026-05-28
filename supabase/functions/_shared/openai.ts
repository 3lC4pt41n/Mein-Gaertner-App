// Shared OpenAI Helper für alle Edge Functions

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_IMAGE_GEN_URL = 'https://api.openai.com/v1/images/generations';

// OpenAI Preise (Stand 2026-05-28 – ggf. anpassen)
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.5': { input: 5.0 / 1_000_000, output: 30.0 / 1_000_000 },
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
};

export interface OpenAIResponse {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  model: string;
  tool_calls?: Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface OpenAIImageResponse {
  image_bytes: Uint8Array;
  model: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.includes(',') ? base64.split(',')[1] : base64;
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
  tools?: any[];
  tool_choice?: string | { type: string };
  response_format?: { type: string };
}): Promise<OpenAIResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY nicht konfiguriert');

  const model = params.model || 'gpt-5.5';

  const body: Record<string, any> = {
    model,
    messages: params.messages,
    max_completion_tokens: params.max_tokens || 1500,
  };

  // GPT-5.5 rejects non-default temperature values on Chat Completions.
  // Keep older model behavior, but let GPT-5.5 use its server default.
  if (!model.startsWith('gpt-5.5')) {
    body.temperature = params.temperature ?? 0.3;
  }

  if (params.tools) {
    body.tools = params.tools;
  }

  if (params.tool_choice) {
    body.tool_choice = params.tool_choice;
  }

  if (params.response_format) {
    body.response_format = params.response_format;
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (json.error) {
    throw new Error(`OpenAI Error: ${json.error.message}`);
  }

  const usage = json.usage || {};
  const prompt_tokens = usage.prompt_tokens || 0;
  const completion_tokens = usage.completion_tokens || 0;
  const total_tokens = prompt_tokens + completion_tokens;

  const pricing = PRICING[model] || PRICING['gpt-5.5'];
  const cost_usd = prompt_tokens * pricing.input + completion_tokens * pricing.output;

  const message = json.choices?.[0]?.message || {};
  const response: OpenAIResponse = {
    content: message.content || '',
    prompt_tokens,
    completion_tokens,
    total_tokens,
    cost_usd,
    model,
  };

  if (message.tool_calls) {
    response.tool_calls = message.tool_calls;
  }

  return response;
}

/**
 * Generate an image with DALL-E 3 via /v1/images/generations.
 * Returns the raw image bytes (PNG) and model name.
 */
export async function callOpenAIImageGenerate(params: {
  prompt: string;
  model?: string;
  size?: '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
}): Promise<OpenAIImageResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY nicht konfiguriert');

  const model = params.model || 'dall-e-3';

  const res = await fetch(OPENAI_IMAGE_GEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: params.prompt,
      n: 1,
      size: params.size || '1024x1024',
      quality: params.quality || 'standard',
      style: params.style || 'natural',
      response_format: 'b64_json',
    }),
  });

  const json = await res.json();

  if (json.error) {
    throw new Error(`OpenAI Error: ${json.error.message}`);
  }

  const outputBase64 = json.data?.[0]?.b64_json;
  if (!outputBase64) {
    throw new Error('OpenAI Error: Kein Bild erhalten');
  }

  return {
    image_bytes: base64ToBytes(outputBase64),
    model,
  };
}
