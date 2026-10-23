import { createHash } from 'node:crypto';
import type { Rule } from '../types';
import { normalizeText } from './normalize';

export { normalizeText };

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Stable JSON: sorted keys, undefined dropped. Used for every hash we bind to. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

export const contentHash = (t: string) => sha256(normalizeText(t));

/** Identity of the active ruleset: changes whenever any enabled rule or its version changes. */
export function hashRuleset(rules: Rule[]): string {
  const stable = rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => ({ id: r.id, v: r.version, type: r.type, sev: r.severity, config: r.config }));
  return sha256(canonical(stable));
}
