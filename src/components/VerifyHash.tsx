'use client';
import { useState } from 'react';
import { normalizeText } from '@/lib/core/normalize';
import { btn, Hash, Notice } from './ui';

export function VerifyHash({ text, expected }: { text: string; expected: string }) {
  const [result, setResult] = useState<{ ok: boolean; got: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setError(null);
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeText(text)));
      const got = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
      setResult({ ok: got === expected, got });
    } catch {
      setError('Your browser blocked the hash check. Open this page over HTTPS.');
    }
  }

  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className={btn.secondary} onClick={check}>Recompute the fingerprint in this browser</button>
        <button className={btn.secondary} onClick={() => window.print()}>Print certificate</button>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {result && (
        <Notice tone={result.ok ? 'good' : 'bad'}>
          {result.ok ? 'Match. This browser computed the same SHA-256 fingerprint from the text above.' : 'No match. The text above does not hash to the approved fingerprint.'}
          <span className="mt-1 block"><Hash value={result.got} full /></span>
        </Notice>
      )}
    </div>
  );
}
