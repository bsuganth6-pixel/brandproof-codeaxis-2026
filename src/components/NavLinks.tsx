'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Worklist' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/brand', label: 'Brand rules' },
  { href: '/insights', label: 'Insights' },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Main">
      {LINKS.map((l) => {
        const on = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={on ? 'page' : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition ${on ? 'bg-ink text-white' : 'text-ink-2 hover:bg-white hover:text-ink'}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
