'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { btn } from './ui';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button className={btn.small} onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); router.push('/login'); router.refresh(); }}>
      Sign out
    </button>
  );
}
