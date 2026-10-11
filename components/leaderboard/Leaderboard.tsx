"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppNav from "@/components/AppNav";
import { FRIENDS_CHANGED, showToast } from "@/lib/toast";

type Row = { user_id: string; username: string; workouts: number; volume: number; sets: number; active_days: number };
type Friendship = { id: string; requester_id: string; addressee_id: string; status: string };
type Metric = "volume" | "workouts" | "sets" | "active_days";

const fmt = (n: number) => Math.round(n).toLocaleString();
const plural = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

const METRICS: { key: Metric; label: string; value: (n: number) => string; gap: (n: number) => string }[] = [
  { key: "volume", label: "Volume", value: (n) => `${fmt(n)} lbs`, gap: (n) => `${fmt(n)} lbs` },
  { key: "workouts", label: "Workouts", value: (n) => String(n), gap: (n) => plural(n, "workout") },
  { key: "sets", label: "Sets", value: (n) => String(n), gap: (n) => plural(n, "set") },
  { key: "active_days", label: "Active days", value: (n) => `${n}/7`, gap: (n) => plural(n, "day") },
];
const PLACES = ["1st place", "2nd place", "3rd place"];

function Icon({ children, size = 16, strokeWidth = 2, className = "" }: { children: ReactNode; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}
const TROPHY = (
  <>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </>
);
const MEDAL = (
  <>
    <circle cx="12" cy="8" r="6" />
    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
  </>
);

export default function Leaderboard() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [metric, setMetric] = useState<Metric>("volume");
  const [friendName, setFriendName] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function loadAll(uid: string) {
    const [{ data: board }, { data: fs }] = await Promise.all([
      supabase.rpc("friend_leaderboard"),
      supabase.from("friendships").select("id, requester_id, addressee_id, status"),
    ]);
    setRows(
      ((board ?? []) as Row[]).map((r) => ({
        ...r,
        workouts: Number(r.workouts),
        volume: Number(r.volume),
        sets: Number(r.sets),
        active_days: Number(r.active_days),
      }))
    );
    const list = (fs ?? []) as Friendship[];
    setFriendships(list);
    const otherIds = list.map((f) => (f.requester_id === uid ? f.addressee_id : f.requester_id));
    if (otherIds.length) {
      const { data: ps } = await supabase.from("profiles").select("id, username").in("id", otherIds);
      setNames(Object.fromEntries((ps ?? []).map((p) => [p.id, p.username ?? "unknown"])));
    }
    setLoaded(true);
  }

  useEffect(() => {
    let uid: string | null = null;
    const refresh = () => {
      if (uid) loadAll(uid);
    };
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      uid = data.user.id;
      setMyId(uid);
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", uid).single();
      setUsername(profile?.username ?? data.user.email ?? "");
      await loadAll(uid);
    }
    load();
    // Refresh when the Toaster hears that someone accepted your request
    window.addEventListener(FRIENDS_CHANGED, refresh);
    return () => window.removeEventListener(FRIENDS_CHANGED, refresh);
  }, [router]);

  if (!loaded || !myId) {
    return (
      <main className="fibr grid place-items-center">
        <p className="fibr-muted">Loading the leaderboard...</p>
      </main>
    );
  }

  const otherId = (f: Friendship) => (f.requester_id === myId ? f.addressee_id : f.requester_id);
  const nameOf = (f: Friendship) => names[otherId(f)] ?? "someone";
  const current = METRICS.find((m) => m.key === metric)!;
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric] || b.volume - a.volume);
  const incoming = friendships.filter((f) => f.status === "pending" && f.addressee_id === myId);
  const outgoing = friendships.filter((f) => f.status === "pending" && f.requester_id === myId);
  const friends = friendships.filter((f) => f.status === "accepted");

  function podiumNote(r: Row, i: number) {
    if (r.user_id !== myId) return `${plural(r.workouts, "workout")} · ${plural(r.active_days, "active day")}`;
    if (i === 0) {
      if (sorted.length < 2) return "Add friends to compete";
      const lead = sorted[0][metric] - sorted[1][metric];
      return lead === 0 ? `Tied with ${sorted[1].username}` : `Leading by ${current.gap(lead)}`;
    }
    const gap = sorted[i - 1][metric] - r[metric];
    return gap === 0 ? `Tied with ${sorted[i - 1].username}` : `${current.gap(gap)} to pass ${sorted[i - 1].username}`;
  }

  // ---------- Friend actions ----------
  async function sendRequest(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const name = friendName.trim();
    if (!name) return;
    setBusy("send");
    const { data: target } = await supabase.from("profiles").select("id, username").ilike("username", name).maybeSingle();
    if (!target) {
      setFormError(`No one goes by "${name}". Check the spelling.`);
      setBusy(null);
      return;
    }
    if (target.id === myId) {
      setFormError("That's you. Try a friend's username.");
      setBusy(null);
      return;
    }
    const existing = friendships.find((f) => otherId(f) === target.id);
    if (existing) {
      setBusy(null);
      if (existing.status === "accepted") setFormError(`You're already friends with ${target.username}.`);
      else if (existing.addressee_id === myId) await acceptRequest(existing); // they asked you first
      else setFormError(`You already sent ${target.username} a request.`);
      return;
    }
    const { error } = await supabase.from("friendships").insert({ requester_id: myId, addressee_id: target.id });
    setBusy(null);
    if (error) {
      setFormError(error.message);
      return;
    }
    setFriendName("");
    showToast({ type: "sent", title: "Friend request sent", body: `We'll let you know when ${target.username} accepts.` });
    await loadAll(myId!);
  }

  async function acceptRequest(f: Friendship) {
    setBusy(f.id);
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", f.id);
    setBusy(null);
    if (error) {
      setFormError(error.message);
      return;
    }
    showToast({ type: "accepted", title: "Friend request accepted", body: `You and ${nameOf(f)} can now compare weekly stats.` });
    await loadAll(myId!);
  }

  async function deleteFriendship(f: Friendship, question?: string) {
    if (question && !confirm(question)) return;
    setBusy(f.id);
    const { error } = await supabase.from("friendships").delete().eq("id", f.id);
    setBusy(null);
    if (error) setFormError(error.message);
    else await loadAll(myId!);
  }

  const sectionStyle = { borderColor: "var(--border-subtle)" };

  return (
    <main className="fibr">
      <AppNav active="/leaderboard" username={username} />

      <div className="mx-auto max-w-[1440px] space-y-8 px-4 py-8 md:px-12 md:py-12">
        {/* Header + metric tabs */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Leaderboard</h1>
            <p className="fibr-muted text-[15px]">You and your friends · last 7 days</p>
          </div>
          <div className="fibr-tabs" role="tablist" aria-label="Rank by">
            {METRICS.map((m) => (
              <button key={m.key} type="button" role="tab" aria-selected={metric === m.key}
                className={`fibr-tab ${metric === m.key ? "is-active" : ""}`} onClick={() => setMetric(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
        </header>

        {/* Podium: same style as the dashboard stat cards */}
        <section className="grid gap-4 sm:grid-cols-3">
          {sorted.slice(0, 3).map((r, i) => {
            const me = r.user_id === myId;
            return (
              <div key={r.user_id} className="fibr-stat">
                <div className="relative z-10 space-y-2">
                  <p className="fibr-label">{PLACES[i]}</p>
                  <p className="flex items-center gap-2 text-2xl font-black">
                    {r.username}
                    {me && <span className="fibr-tag">YOU</span>}
                  </p>
                  <p className="text-[32px] font-black leading-tight tracking-tight">{current.value(r[metric])}</p>
                  <p className="text-[13px] font-medium" style={{ color: me ? "var(--status-ready)" : "var(--text-secondary)" }}>
                    {podiumNote(r, i)}
                  </p>
                </div>
                <Icon size={72} strokeWidth={1.5} className="fibr-watermark absolute right-8 top-1/2 -translate-y-1/2">
                  {i === 0 ? TROPHY : MEDAL}
                </Icon>
              </div>
            );
          })}
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
          {/* Rankings */}
          <section className="fibr-card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <h2 className="fibr-heading">Rankings</h2>
              <p className="fibr-faint text-[13px]">Sorted by {current.label.toLowerCase()} · rolling 7 days</p>
            </div>
            <div className="grid grid-cols-[32px_1fr_auto] items-center gap-4 px-4 sm:grid-cols-[48px_1fr_96px_72px_104px_136px]">
              <span className="fibr-label">Rank</span>
              <span className="fibr-label">Athlete</span>
              <span className="fibr-label hidden text-right sm:block">Workouts</span>
              <span className="fibr-label hidden text-right sm:block">Sets</span>
              <span className="fibr-label hidden text-right sm:block">Active days</span>
              <span className="fibr-label text-right">Volume</span>
            </div>
            <ol className="space-y-2">
              {sorted.map((r, i) => {
                const me = r.user_id === myId;
                return (
                  <li key={r.user_id}
                    className={`fibr-rank-row grid grid-cols-[32px_1fr_auto] items-center gap-4 px-4 py-2 sm:grid-cols-[48px_1fr_96px_72px_104px_136px] ${me ? "is-me" : ""}`}>
                    <span className="text-base font-black">{i + 1}</span>
                    <span className="flex min-w-0 items-center gap-4">
                      <span className={`fibr-avatar-sm ${me ? "is-me" : ""}`}>{r.username.charAt(0).toUpperCase()}</span>
                      <span className="truncate text-sm font-semibold">{r.username}</span>
                      {me && <span className="fibr-tag">YOU</span>}
                    </span>
                    <span className="fibr-muted hidden text-right text-sm font-medium sm:block">{r.workouts}</span>
                    <span className="fibr-muted hidden text-right text-sm font-medium sm:block">{r.sets}</span>
                    <span className="fibr-muted hidden text-right text-sm font-medium sm:block">{r.active_days}/7</span>
                    <span className="text-right text-sm font-bold">{fmt(r.volume)} lbs</span>
                  </li>
                );
              })}
            </ol>
            {rows.length <= 1 && (
              <p className="fibr-muted pt-4 text-sm">It&apos;s just you so far. Add a friend on the right to start competing.</p>
            )}
          </section>

          {/* Friends */}
          <aside className="fibr-card space-y-6">
            <form className="space-y-4" onSubmit={sendRequest}>
              <h2 className="fibr-label">Add a friend</h2>
              <p className="fibr-muted text-[13px] leading-relaxed">
                Your username is <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{username}</span>.
                Share it so friends can find you.
              </p>
              <input className="fibr-input" placeholder="Friend's username" value={friendName}
                onChange={(e) => {
                  setFriendName(e.target.value);
                  setFormError("");
                }} />
              {formError && <p className="fibr-error">{formError}</p>}
              <button type="submit" className="fibr-btn w-full" disabled={!friendName.trim() || busy === "send"}>
                {busy === "send" ? "Sending..." : "Send request"}
              </button>
            </form>

            {incoming.length > 0 && (
              <section className="space-y-4 border-t pt-6" style={sectionStyle}>
                <h2 className="flex items-center gap-2">
                  <span className="fibr-label">Requests</span>
                  <span className="fibr-count">{incoming.length}</span>
                </h2>
                {incoming.map((f) => (
                  <div key={f.id} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <span className="fibr-avatar-sm">{nameOf(f).charAt(0).toUpperCase()}</span>
                      <div>
                        <p className="text-sm font-semibold">{nameOf(f)}</p>
                        <p className="fibr-muted text-xs">Wants to compare stats</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" className="fibr-btn fibr-btn-sm" disabled={busy === f.id} onClick={() => acceptRequest(f)}>
                        Accept
                      </button>
                      <button type="button" className="fibr-btn-ghost fibr-btn-sm" disabled={busy === f.id}
                        onClick={() => deleteFriendship(f)}>
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-4 border-t pt-6" style={sectionStyle}>
              <h2 className="flex items-center gap-2">
                <span className="fibr-label">Friends</span>
                <span className="fibr-count">{friends.length}</span>
              </h2>
              {friends.length === 0 && outgoing.length === 0 ? (
                <p className="fibr-faint text-[13px]">No friends yet.</p>
              ) : (
                <ul className="space-y-4">
                  {friends.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-4">
                        <span className="fibr-avatar-sm">{nameOf(f).charAt(0).toUpperCase()}</span>
                        <span className="text-sm font-semibold">{nameOf(f)}</span>
                      </span>
                      <button type="button" className="fibr-link-quiet" disabled={busy === f.id}
                        onClick={() => deleteFriendship(f, `Remove ${nameOf(f)} from your friends?`)}>
                        Remove
                      </button>
                    </li>
                  ))}
                  {outgoing.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-4">
                        <span className="fibr-avatar-sm is-pending">{nameOf(f).charAt(0).toUpperCase()}</span>
                        <span>
                          <span className="block text-sm font-semibold">{nameOf(f)}</span>
                          <span className="fibr-muted block text-xs">Request pending</span>
                        </span>
                      </span>
                      <button type="button" className="fibr-link-quiet" disabled={busy === f.id}
                        onClick={() => deleteFriendship(f)}>
                        Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
