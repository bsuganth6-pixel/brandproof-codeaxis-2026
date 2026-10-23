import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Actor } from '@/lib/services';
import { NavLinks } from './NavLinks';
import { SignOutButton } from './SignOutButton';
import { RegMark } from './ui';

export const ROLE_LABEL = { admin: 'Brand admin', author: 'Author', approver: 'Approver' } as const;

export function Shell({ actor, children }: { actor: Actor; children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-bench/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <RegMark />
            <span className="text-lg font-bold tracking-tight">BrandProof</span>
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="font-medium">{actor.name} <span className="font-normal text-ink-2">({ROLE_LABEL[actor.role]})</span></span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </>
  );
}
