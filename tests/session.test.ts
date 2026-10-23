import { describe, expect, it } from 'vitest';
import { getProvider } from '@/lib/llm';
import { hashPassword, verifyPassword } from '@/lib/password';
import { readSession, signSession } from '@/lib/session';

describe('session cookie', () => {
  it('round-trips a valid token', () => expect(readSession(signSession('usr_1'))).toBe('usr_1'));
  it('rejects a tampered token', () => {
    const [body, sig] = signSession('usr_1').split('.');
    const forged = `${Buffer.from(JSON.stringify({ uid: 'usr_admin', exp: Date.now() + 1e6 })).toString('base64url')}.${sig}`;
    expect(readSession(forged)).toBeNull();
    expect(readSession(`${body}.x${sig}`)).toBeNull();
  });
  it('rejects an expired token', () => {
    const token = signSession('usr_1', Date.now() - 9 * 3600 * 1000);
    expect(readSession(token)).toBeNull();
  });
  it('rejects empty and malformed values', () => {
    expect(readSession(undefined)).toBeNull();
    expect(readSession('nope')).toBeNull();
  });
});

describe('passwords and provider selection', () => {
  it('verifies the right password only', () => {
    const h = hashPassword('correct horse');
    expect(verifyPassword('correct horse', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
  });
  it('falls back to the offline provider without keys', () => {
    expect(getProvider({} as NodeJS.ProcessEnv).name).toBe('mock-offline');
    expect(getProvider({ ANTHROPIC_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv).name).toBe('anthropic');
    expect(getProvider({ OPENAI_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv).name).toBe('mock-offline'); // needs LLM_MODEL
    expect(getProvider({ OPENAI_API_KEY: 'k', LLM_MODEL: 'm' } as unknown as NodeJS.ProcessEnv).name).toBe('openai');
  });
});
