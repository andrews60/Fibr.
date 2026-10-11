"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { FRIENDS_CHANGED, REQUESTS_CHANGED } from "@/lib/toast";

const LINKS = [
  ["Dashboard", "/dashboard"],
  ["Log workout", "/log"],
  ["Leaderboard", "/leaderboard"],
  ["Profile", "/profile"],
] as const;

type Props = {
  active: (typeof LINKS)[number][1];
  username: string;
};

export default function AppNav({ active, username }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(0);

  // How many friend requests are waiting for me? Updates live.
  useEffect(() => {
    async function count() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { count } = await supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("addressee_id", data.user.id)
        .eq("status", "pending");
      setPending(count ?? 0);
    }
    count();
    window.addEventListener(FRIENDS_CHANGED, count);
    window.addEventListener(REQUESTS_CHANGED, count);
    window.addEventListener("focus", count);
    return () => {
      window.removeEventListener(FRIENDS_CHANGED, count);
      window.removeEventListener(REQUESTS_CHANGED, count);
      window.removeEventListener("focus", count);
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const links = LINKS.map(([label, href]) => {
    const isActive = href === active;
    const badge = href === "/leaderboard" && pending > 0;
    return (
      <Link
        key={href}
        href={href}
        className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition-colors ${
          isActive ? "" : "border-transparent hover:text-[var(--text-primary)]"
        }`}
        style={
          isActive
            ? { borderColor: "var(--accent)", color: "var(--text-primary)" }
            : { color: "var(--text-secondary)" }
        }
      >
        {label}
        {badge && (
          <span className="fibr-nav-badge" aria-label={`${pending} pending friend request${pending === 1 ? "" : "s"}`}>
            {pending > 9 ? "9+" : pending}
          </span>
        )}
      </Link>
    );
  });

  return (
    <header className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-12">
        <Link href="/dashboard" className="text-[26px] font-bold tracking-tight">
          fibr<span style={{ color: "var(--accent)" }}>.</span>
        </Link>
        <nav className="hidden items-center gap-2 md:flex">{links}</nav>
        <div className="flex items-center gap-4">
          <button onClick={handleSignOut} className="fibr-muted text-sm font-medium hover:text-[var(--text-primary)]">
            Sign out
          </button>
          <div className="fibr-avatar">{username.charAt(0).toUpperCase() || "?"}</div>
        </div>
      </div>
      {/* On phones the links scroll sideways under the logo */}
      <nav className="flex gap-2 overflow-x-auto px-2 pb-2 md:hidden">{links}</nav>
    </header>
  );
}
