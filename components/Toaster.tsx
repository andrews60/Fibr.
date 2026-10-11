"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { FRIENDS_CHANGED, TOAST_EVENT, showToast, type ToastInput, type ToastType } from "@/lib/toast";

type Toast = ToastInput & { id: number; leaving?: boolean };

const DURATION_MS = 4500;

const ICONS: Record<ToastType, ReactNode> = {
  sent: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  accepted: <path d="M20 6 9 17l-5-5" />,
  "was-accepted": (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
};

function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  // 1. Show toasts that any page asks for
  useEffect(() => {
    function onToast(e: Event) {
      const t = (e as CustomEvent<ToastInput>).detail;
      setToasts((ts) => [...ts.slice(-2), { ...t, id: nextId.current++ }]); // keep at most 3
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  // 2. Watch for MY friend requests being accepted by someone else
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function announce(addresseeIds: string[]) {
      const { data } = await supabase.from("profiles").select("id, username").in("id", addresseeIds);
      for (const id of addresseeIds) {
        const name = data?.find((p) => p.id === id)?.username ?? "Your friend";
        showToast({
          type: "was-accepted",
          title: "Your friend request has been accepted",
          body: `${name} accepted. They're on your leaderboard now.`,
        });
      }
      window.dispatchEvent(new Event(FRIENDS_CHANGED));
    }

    async function watch() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;

      const key = `fibr:seen-accepted:${uid}`;
      const readSeen = (): string[] | null => {
        try {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw) as string[]) : null;
        } catch {
          return null;
        }
      };
      const writeSeen = (ids: string[]) => {
        try {
          localStorage.setItem(key, JSON.stringify(ids));
        } catch {
          // storage unavailable: worst case the toast shows again later
        }
      };

      // Catch up on anything accepted while you were away
      const { data: accepted } = await supabase
        .from("friendships")
        .select("id, addressee_id")
        .eq("requester_id", uid)
        .eq("status", "accepted");
      const list = accepted ?? [];
      const seen = readSeen();
      if (seen === null) {
        writeSeen(list.map((f) => f.id)); // first visit on this browser: don't announce old ones
      } else {
        const fresh = list.filter((f) => !seen.includes(f.id));
        if (fresh.length) {
          writeSeen([...seen, ...fresh.map((f) => f.id)]);
          await announce(fresh.map((f) => f.addressee_id));
        }
      }
      if (cancelled) return;

      // And listen live while the app is open
      channel = supabase
        .channel(`friend-accepts-${uid}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "friendships", filter: `requester_id=eq.${uid}` },
          async (payload) => {
            const row = payload.new as { id: string; addressee_id: string; status: string };
            if (row.status !== "accepted") return;
            const current = readSeen() ?? [];
            if (current.includes(row.id)) return;
            writeSeen([...current, row.id]);
            await announce([row.addressee_id]);
          }
        )
        .subscribe();
    }

    watch();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const dismiss = (id: number) => setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
  const remove = (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id));

  return (
    <div className="fibr-toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`fibr-toast ${t.leaving ? "is-leaving" : ""}`}
          onAnimationEnd={(e) => {
            if (e.animationName === "fibr-toast-out") remove(t.id);
          }}
        >
          <span className="fibr-toast-icon">
            <Svg>{ICONS[t.type]}</Svg>
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body && <p className="fibr-muted text-[13px] leading-relaxed">{t.body}</p>}
          </div>
          <button type="button" className="fibr-toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <Svg>
              <path d="M18 6 6 18M6 6l12 12" />
            </Svg>
          </button>
          {!t.leaving && (
            <span
              className="fibr-toast-timer"
              style={{ animationDuration: `${DURATION_MS}ms` }}
              onAnimationEnd={(e) => {
                e.stopPropagation();
                dismiss(t.id);
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
