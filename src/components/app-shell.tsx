import type { ReactNode } from "react";
import Link from "next/link";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Equinox home">
          <span className="brand-symbol" aria-hidden="true">e</span>
          Equinox
        </Link>
        <span className="header-caption">A clearer view of your investments</span>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="site-footer">Perspective for the long term.</footer>
    </div>
  );
}
