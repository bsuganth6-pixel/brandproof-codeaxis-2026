import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';
import { OpenAIProvider } from './openai';
import type { LLMProvider } from './types';

export function getProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  const choice = (env.LLM_PROVIDER || '').toLowerCase() || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : 'mock');
  if (choice === 'anthropic' && env.ANTHROPIC_API_KEY) return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.LLM_MODEL || 'claude-sonnet-5-5');
  if (choice === 'openai' && env.OPENAI_API_KEY && env.LLM_MODEL) return new OpenAIProvider(env.OPENAI_API_KEY, env.LLM_MODEL, env.OPENAI_BASE_URL);
  return new MockProvider();
}
