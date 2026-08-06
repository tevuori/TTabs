"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSession, ensureAdminSeeded, type Session } from "@/lib/auth";

// Wraps protected pages. Redirects to /login if no valid session.
// Renders a loading state while checking.
export function useAuth(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ensureAdminSeeded().then(() => {
      setSession(getSession());
      setLoading(false);
    });
  }, []);

  return { session, loading };
}

// A hook that redirects to /login if not authenticated.
// Returns { session, loading } so the caller can render a spinner.
export function useRequireAuth(): { session: Session | null; loading: boolean } {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session, router]);

  return { session, loading };
}

// Full-screen loading spinner.
export function AuthLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-8 h-8 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
    </div>
  );
}

// Wrap children with auth gating. Use in page components.
export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useRequireAuth();
  if (loading || !session) return <AuthLoadingScreen />;
  return <>{children}</>;
}
