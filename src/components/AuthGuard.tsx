"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSession, validateSession, type Session } from "@/lib/auth";

// Hook: get the current session (synchronous from localStorage) + validate
// it server-side. Returns { session, loading }.
export function useAuth(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const local = getSession();
    if (!local) {
      setLoading(false);
      return;
    }
    // Optimistically show the session, then validate server-side.
    setSession(local);
    validateSession().then(valid => {
      if (!valid) {
        setSession(null);
      }
      setLoading(false);
    });
  }, []);

  return { session, loading };
}

// Hook: redirect to /login if not authenticated.
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

export function AuthLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-8 h-8 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
    </div>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useRequireAuth();
  if (loading || !session) return <AuthLoadingScreen />;
  return <>{children}</>;
}
