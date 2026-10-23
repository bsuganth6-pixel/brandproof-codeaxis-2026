'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { CHANNEL_LABEL } from '@/lib/format';
import { btn, field, Notice } from './ui';

const EXAMPLE = 'Our cheap beans are the best in town! 20% off this weekend, so hurry. Founded in 2010 and now delivered to 20 countries.';

export function NewReviewForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('social');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { review } = await api<{ review: { id: string } }>('/api/reviews', { body: { title, channel, text } });
      router.push(`/reviews/${review.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the draft.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-3xl space-y-5 rounded-lg border border-line bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <label className="block text-sm font-medium">Title
          <input className={`${field} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend flash sale post" required minLength={3} maxLength={120} />
        </label>
        <label className="block text-sm font-medium">Where it will run
          <select className={`${field} mt-1`} value={channel} onChange={(e) => setChannel(e.target.value)}>
            {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">Draft text
        <textarea className={`${field} mt-1 min-h-56 font-serif text-base leading-7`} value={text} onChange={(e) => setText(e.target.value)} required maxLength={20000} />
        <span className="mt-1 flex justify-between text-xs font-normal text-ink-2">
          <button type="button" className="underline underline-offset-2" onClick={() => { setText(EXAMPLE); if (!title) setTitle('Example promo post'); }}>Fill with an example</button>
          <span>{text.length.toLocaleString('en-IN')} of 20,000 characters</span>
        </span>
      </label>
      {error && <Notice tone="bad">{error}</Notice>}
      <button className={btn.primary} disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</button>
    </form>
  );
}
