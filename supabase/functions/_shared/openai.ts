// Shared OpenAI Helper für alle Edge Functions
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_IMAGE_EDIT_URL = 'https://api.openai.com/v1/images/edits';

// GPT-4o Preise (Stand Feb 2026 – ggf. anpassen)
const PRICING: Record<string, { input: number; output: number }> = {
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

export interface OpenAIImageEditResponse {
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
}): Promise<OpenAIResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY nicht konfiguriert');

  const model = params.model || 'gpt-4o';

  const body: Record<string, any> = {
    model,
    messages: params.messages,
    max_tokens: params.max_tokens || 1500,
    temperature: params.temperature ?? 0.3,
  };

  if (params.tools) {
    body.tools = params.tools;
  }

  if (params.tool_choice) {
    body.tool_choice = params.tool_choice;
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

  const pricing = PRICING[model] || PRICING['gpt-4o'];
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

export async function callOpenAIImageEdit(params: {
  image_base64: string;
  prompt: string;
  model?: string;
  size?: '512x512' | '1024x1024';
}): Promise<OpenAIImageEditResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY nicht konfiguriert');

  const model = params.model || 'dall-e-2';
  const imageBytes = base64ToBytes(params.image_base64);

  // dall-e-2 /v1/images/edits only accepts PNG – convert from JPEG/any format
  const decoded = await Image.decode(imageBytes);
  const pngBytes = await decoded.encode();
  const file = new File([pngBytes], 'user-photo.png', { type: 'image/png' });

  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', params.prompt);
  formData.append('size', params.size || '1024x1024');
  formData.append('response_format', 'b64_json');
  formData.append('image', file);

  const res = await fetch(OPENAI_IMAGE_EDIT_URL, {
    method: 'POST',
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
    throw new Error('OpenAI Error: Kein Avatar-Bild erhalten');
  }

  return {
    image_bytes: base64ToBytes(outputBase64),
    model,
  };
}
