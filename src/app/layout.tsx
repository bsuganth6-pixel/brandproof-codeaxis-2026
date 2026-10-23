import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'BrandProof: evidence-backed brand governance',
  description: 'Check copy against approved brand rules and facts, see the evidence for every finding, and keep a named human accountable for the approval.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
