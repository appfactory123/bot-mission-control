"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { appModules } from "../lib/modules";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isActive = (slug: string) => pathname === `/${slug}`;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo-wrap">
          <div className="logo-mark">MC</div>
          <div>
            <p className="text-muted text-xs">Mission Control</p>
            <p className="logo-title">SaaS Console</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {appModules.map((module) => (
            <Link
              key={module.slug}
              href={`/${module.slug}`}
              className={`nav-link ${isActive(module.slug) ? "nav-link--active" : ""}`}
            >
              <span>{module.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="shell-main">
        <header className="header">
          <div className="header-logo">
            <div className="logo-dot" />
            <span>Mission Control</span>
          </div>

          <label className="search" aria-label="Global search">
            <span className="text-muted">⌕</span>
            <input placeholder="Search agents, workflows, tasks..." />
          </label>

          <div className="header-actions">
            <button type="button" className="icon-btn" aria-label="Notifications">
              🔔
            </button>
            <button type="button" className="profile-btn" aria-label="User profile">
              VP
            </button>
          </div>
        </header>

        <main className="module-content">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Bottom navigation">
        {appModules.map((module) => (
          <Link
            key={module.slug}
            href={`/${module.slug}`}
            className={`mobile-link ${isActive(module.slug) ? "mobile-link--active" : ""}`}
          >
            {module.shortLabel}
          </Link>
        ))}
      </nav>
    </div>
  );
}
