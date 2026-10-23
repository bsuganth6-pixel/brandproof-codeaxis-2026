import { postJSON } from './http';
import { buildPrompt, parseAIResponse } from './prompt';
import type { AnalyzeRequest, LLMProvider, RawAIFinding } from './types';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  constructor(private key: string, public model: string) {}

  async analyze(req: AnalyzeRequest): Promise<RawAIFinding[]> {
    const { system, user } = buildPrompt(req);
    const body: Record<string, unknown> = { model: this.model, max_tokens: 1800, system, messages: [{ role: 'user', content: user }] };
    if (process.env.LLM_TEMPERATURE) body.temperature = Number(process.env.LLM_TEMPERATURE);
    const res = await postJSON('https://api.anthropic.com/v1/messages', { 'x-api-key': this.key, 'anthropic-version': '2023-06-01' }, body);
    const text = (res.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
    return parseAIResponse(text);
  }
}
