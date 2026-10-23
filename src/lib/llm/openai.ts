import { postJSON } from './http';
import { buildPrompt, parseAIResponse } from './prompt';
import type { AnalyzeRequest, LLMProvider, RawAIFinding } from './types';

/** Works with OpenAI and any OpenAI-compatible endpoint (set OPENAI_BASE_URL). */
export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  constructor(private key: string, public model: string, private baseUrl = 'https://api.openai.com/v1') {}

  async analyze(req: AnalyzeRequest): Promise<RawAIFinding[]> {
    const { system, user } = buildPrompt(req);
    const res = await postJSON(
      `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      { authorization: `Bearer ${this.key}` },
      { model: this.model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
    );
    return parseAIResponse(res.choices?.[0]?.message?.content ?? '');
  }
}
