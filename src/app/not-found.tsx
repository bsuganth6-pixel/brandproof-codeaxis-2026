import Link from 'next/link';
import { btn, RegMark } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-4 px-5">
      <RegMark size={28} />
      <h1 className="text-3xl font-bold tracking-tight">That page is not on this proof sheet</h1>
      <p className="text-ink-2">The review or page you asked for does not exist, or it belongs to another workspace.</p>
      <Link href="/" className={btn.primary}>Back to the worklist</Link>
    </main>
  );
}
