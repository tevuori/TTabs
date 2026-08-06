"use client";

import { useRouter } from "next/navigation";
import Nav from "./Nav";

// Shared page header with logo and responsive navigation.
// The header is sticky and has a relative position so the mobile nav
// dropdown can anchor to it.
export default function Header() {
  const router = useRouter();

  return (
    <header className="border-b border-bg-border sticky top-0 bg-bg/90 backdrop-blur-sm z-40 relative">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 flex-shrink-0"
        >
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 3V15M9 3V15M13 3V15M3 6H15M3 10H15" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-xl font-bold text-text">TTabs</span>
        </button>
        <Nav />
      </div>
    </header>
  );
}
