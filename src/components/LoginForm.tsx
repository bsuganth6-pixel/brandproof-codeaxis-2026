'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { btn, field, Notice } from './ui';

const DEMO = [
  { role: 'author', name: 'Arun Kumar', note: 'Writes drafts, runs the analysis, submits for approval' },
  { role: 'approver', name: 'Meera Nair', note: 'Approves, requests changes, overrides critical findings' },
  { role: 'admin', name: 'Priya Raman', note: 'Manages the brand rules and can act as either role' },
] as const;

export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { body });
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {demo && (
        <section aria-labelledby="demo-h">
          <h2 id="demo-h" className="text-base font-semibold">Try the demo as</h2>
          <div className="mt-3 grid gap-2">
            {DEMO.map((d) => (
              <button key={d.role} disabled={busy} onClick={() => go({ role: d.role })}
                className="rounded-md border border-line bg-white px-4 py-3 text-left transition hover:border-ink disabled:opacity-50">
                <span className="block text-sm font-semibold">{d.name}, {d.role === 'admin' ? 'brand admin' : d.role}</span>
                <span className="block text-sm text-ink-2">{d.note}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="signin-h">
        <h2 id="signin-h" className="text-base font-semibold">Sign in with your account</h2>
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); go({ email, password }); }}>
          <label className="block text-sm font-medium">Email
            <input className={`${field} mt-1`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block text-sm font-medium">Password
            <input className={`${field} mt-1`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className={btn.primary} disabled={busy}>Sign in</button>
        </form>
      </section>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
