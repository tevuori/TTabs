"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { IS_MOBILE } from "@/lib/app-mode";

interface NavItem {
  label: string;
  href: string;
}

const SERVER_NAV_ITEMS: NavItem[] = [
  { label: "Search", href: "/" },
  { label: "Library", href: "/library" },
  { label: "Chords", href: "/chords" },
  { label: "Capo", href: "/capo" },
  { label: "Setlists", href: "/setlists" },
  { label: "Sync", href: "/sync" },
  { label: "Settings", href: "/settings" },
];

// Mobile mode: no Search (offline), no Settings (no user management).
// No Home — the home page redirects to /library after first setup.
// Sync is accessible from the menu.
const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: "Library", href: "/library" },
  { label: "Chords", href: "/chords" },
  { label: "Capo", href: "/capo" },
  { label: "Setlists", href: "/setlists" },
  { label: "Sync", href: "/sync" },
];

// Shared responsive navigation bar.
// On desktop: horizontal links inline.
// On mobile: a hamburger button that toggles a dropdown panel.
export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navItems = useMemo(() => (IS_MOBILE ? MOBILE_NAV_ITEMS : SERVER_NAV_ITEMS), []);

  // Close the mobile menu on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const navigate = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  return (
    <nav className="flex items-center gap-1">
      {/* Desktop nav — hidden on small screens */}
      <div className="hidden sm:flex items-center gap-1">
        {navItems.map(item => (
          <button
            key={item.href}
            onClick={() => navigate(item.href)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              pathname === item.href
                ? "text-text hover:text-accent"
                : "text-text-muted hover:text-accent"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Mobile hamburger — visible only on small screens */}
      <button
        onClick={() => setOpen(o => !o)}
        className="sm:hidden w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
        title="Menu"
        aria-label="Toggle navigation menu"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 5H15M3 9H15M3 13H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div className="sm:hidden absolute top-full left-0 right-0 bg-bg-card border-b border-bg-border shadow-lg z-50">
          <div className="px-4 py-2 flex flex-col gap-0.5">
            {navItems.map(item => (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                className={`px-3 py-2.5 text-sm font-medium text-left rounded-lg transition-colors ${
                  pathname === item.href
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text hover:bg-bg-hover"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
