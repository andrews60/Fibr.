"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import {
  FRIENDS_CHANGED,
  REQUESTS_CHANGED,
  TOAST_EVENT,
  showToast,
  type ToastInput,
  type ToastType,
} from "@/lib/toast";

type Toast = ToastInput & { id: number; leaving?: boolean };

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
  received: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
};

// Requests stay up a little longer, since they have a button
const durationFor = (t: Toast) => (t.action ? 7000 : 4500);

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

  // 2. Watch friend activity: requests sent TO me, and MY requests being accepted
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function usernames(ids: string[]) {
      const { data } = await supabase.from("profiles").select("id, username").in("id", ids);
      return ids.map((id) => data?.find((p) => p.id === id)?.username ?? "Someone");
    }

    function changed() {
      window.dispatchEvent(new Event(FRIENDS_CHANGED));
      window.dispatchEvent(new Event(REQUESTS_CHANGED));
    }

    async function announceRequests(requesterIds: string[]) {
      const names = await usernames(requesterIds);
      showToast(
        names.length === 1
          ? {
              type: "received",
              title: "New friend request",
              body: `${names[0]} wants to compare stats.`,
              action: { label: "Review request", href: "/leaderboard" },
            }
          : {
              type: "received",
              title: `${names.length} new friend requests`,
              body: `From ${names.join(", ")}.`,
              action: { label: "Review requests", href: "/leaderboard" },
            }
      );
      changed();
    }

    async function announceAccepted(addresseeIds: string[]) {
      const names = await usernames(addresseeIds);
      for (const name of names) {
        showToast({
          type: "was-accepted",
          title: "Your friend request has been accepted",
          body: `${name} accepted. They're on your leaderboard now.`,
        });
      }
      changed();
    }

    async function watch() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;

      const KEYS = { accepted: `fibr:seen-accepted:${uid}`, requests: `fibr:seen-requests:${uid}` };
      const read = (key: string): string[] | null => {
        try {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw) as string[]) : null;
        } catch {
          return null;
        }
      };
      const write = (key: string, ids: string[]) => {
        try {
          localStorage.setItem(key, JSON.stringify(ids));
        } catch {
          // storage unavailable: worst case a toast repeats later
        }
      };
      // Returns the items we haven't announced yet (first visit on this browser: none)
      const catchUp = <T extends { id: string }>(key: string, list: T[]): T[] => {
        const seen = read(key);
        if (seen === null) {
          write(key, list.map((f) => f.id));
          return [];
        }
        const fresh = list.filter((f) => !seen.includes(f.id));
        if (fresh.length) write(key, [...seen, ...fresh.map((f) => f.id)]);
        return fresh;
      };
      const markSeen = (key: string, id: string) => {
        const seen = read(key) ?? [];
        if (seen.includes(id)) return false;
        write(key, [...seen, id]);
        return true;
      };

      // Catch up on anything that happened while you were away
      const [{ data: accepted }, { data: incoming }] = await Promise.all([
        supabase.from("friendships").select("id, addressee_id").eq("requester_id", uid).eq("status", "accepted"),
        supabase.from("friendships").select("id, requester_id").eq("addressee_id", uid).eq("status", "pending"),
      ]);
      const freshAccepted = catchUp(KEYS.accepted, accepted ?? []);
      const freshIncoming = catchUp(KEYS.requests, incoming ?? []);
      if (freshIncoming.length) await announceRequests(freshIncoming.map((f) => f.requester_id));
      if (freshAccepted.length) await announceAccepted(freshAccepted.map((f) => f.addressee_id));
      if (cancelled) return;

      // Then listen live while the app is open
      channel = supabase
        .channel(`friend-activity-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "friendships", filter: `addressee_id=eq.${uid}` },
          async (payload) => {
            const row = payload.new as { id: string; requester_id: string; status: string };
            if (row.status === "pending" && markSeen(KEYS.requests, row.id)) await announceRequests([row.requester_id]);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "friendships", filter: `requester_id=eq.${uid}` },
          async (payload) => {
            const row = payload.new as { id: string; addressee_id: string; status: string };
            if (row.status === "accepted" && markSeen(KEYS.accepted, row.id)) await announceAccepted([row.addressee_id]);
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
            {t.action && (
              <Link href={t.action.href} className="fibr-toast-action" onClick={() => dismiss(t.id)}>
                {t.action.label} →
              </Link>
            )}
          </div>
          <button type="button" className="fibr-toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <Svg>
              <path d="M18 6 6 18M6 6l12 12" />
            </Svg>
          </button>
          {!t.leaving && (
            <span
              className="fibr-toast-timer"
              style={{ animationDuration: `${durationFor(t)}ms` }}
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
