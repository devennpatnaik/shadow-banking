import Link from 'next/link';
import type { ReactNode } from 'react';

const LINKS = [
  { href: '/', label: 'Book' },
  { href: '/stack', label: 'Stack' },
  { href: '/paper', label: 'Paper' },
  { href: '/proposals', label: 'Proposals' },
  { href: '/settings', label: 'Settings' },
] as const;

export function Shell(props: {
  title: string;
  viewerName: string;
  simulated: boolean;
  sampleMarket: boolean;
  path: string;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <p className="brand">
            Shadow Banking
            <span>Private paper book · simultaneous multi-use of equity</span>
          </p>
        </div>
        <nav className="nav" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={props.path === l.href ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="ribbons">
        <span className="ribbon">Signed-in tool · {props.viewerName}</span>
        {props.simulated ? (
          <span className="ribbon warn">Simulated viewer (local). Not a Cursor gate session.</span>
        ) : null}
        {props.sampleMarket ? (
          <span className="ribbon sample">Market data: fixture sample (not live)</span>
        ) : null}
        <span className="ribbon stop">No broadcast · no signing keys · propose/approve only</span>
      </div>
      <h1>{props.title}</h1>
      {props.children}
    </div>
  );
}
