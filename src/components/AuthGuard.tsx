"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSession, validateSession, type Session } from "@/lib/auth";
import { IS_MOBILE } from "@/lib/app-mode";

// A synthetic local session used in mobile mode (no server, no auth).
const MOBILE_SESSION: Session = {
  token: "local",
  userId: "local",
  username: "Local",
  isAdmin: false,
  expiresAt: Number.MAX_SAFE_INTEGER,
};

// Hook: get the current session (synchronous from localStorage) + validate
// it server-side. Returns { session, loading }.
//
// In mobile mode there is no server, so we short-circuit with a synthetic
// local session and never validate.
export function useAuth(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_MOBILE) {
      setSession(MOBILE_SESSION);
      setLoading(false);
      return;
    }

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
// In mobile mode this is a no-op — there is no login.
export function useRequireAuth(): { session: Session | null; loading: boolean } {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (IS_MOBILE) return;
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
