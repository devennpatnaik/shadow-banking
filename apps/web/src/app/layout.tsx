import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shadow Banking — paper book',
  description:
    'Private signed-in paper book: simultaneous multi-use of the same equity. Propose and approve only. Never broadcasts.',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
