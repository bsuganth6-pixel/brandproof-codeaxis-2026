'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { btn, field, Notice } from './ui';

export function RuleToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className={btn.small} disabled={busy} aria-pressed={enabled}
      onClick={async () => { setBusy(true); try { await api(`/api/rules/${id}`, { method: 'PATCH', body: { enabled: !enabled } }); router.refresh(); } finally { setBusy(false); } }}>
      {enabled ? 'Turn off' : 'Turn on'}
    </button>
  );
}

export function AddRuleForm({ guideName }: { guideName: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [terms, setTerms] = useState('');
  const [preferred, setPreferred] = useState('');
  const [severity, setSeverity] = useState('major');
  const [doc, setDoc] = useState(guideName);
  const [quote, setQuote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/rules', {
        body: { title, terms: terms.split(',').map((t) => t.trim()).filter(Boolean), preferred: preferred || undefined, severity, sourceDoc: doc, sourceQuote: quote },
      });
      setTitle(''); setTerms(''); setPreferred(''); setQuote('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the rule.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-line bg-white p-5">
      <h3 className="text-base font-semibold">Add a terminology rule</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Rule title
          <input className={`${field} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Say beans, not seeds" required minLength={3} />
        </label>
        <label className="block text-sm font-medium">Severity
          <select className={`${field} mt-1`} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="critical">Critical</option><option value="major">Major</option><option value="minor">Minor</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Terms to flag, separated by commas
          <input className={`${field} mt-1`} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="seeds, kernels" required />
        </label>
        <label className="block text-sm font-medium">Preferred wording (optional)
          <input className={`${field} mt-1`} value={preferred} onChange={(e) => setPreferred(e.target.value)} placeholder="beans" />
        </label>
        <label className="block text-sm font-medium">Brand guide document
          <input className={`${field} mt-1`} value={doc} onChange={(e) => setDoc(e.target.value)} required />
        </label>
        <label className="block text-sm font-medium">Quote from the guide that backs this rule
          <input className={`${field} mt-1`} value={quote} onChange={(e) => setQuote(e.target.value)} required minLength={8} />
        </label>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <button className={btn.primary} disabled={busy}>{busy ? 'Adding…' : 'Add rule'}</button>
    </form>
  );
}
