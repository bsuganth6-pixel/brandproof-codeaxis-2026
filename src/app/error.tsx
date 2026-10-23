'use client';
import { btn, RegMark } from '@/components/ui';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-4 px-5">
      <RegMark size={28} />
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong on our side</h1>
      <p className="text-ink-2">Your data is safe. If you are running on MongoDB, check that MONGODB_URI is correct and that Atlas allows connections from this host.</p>
      <button className={btn.primary} onClick={reset}>Try again</button>
    </main>
  );
}
