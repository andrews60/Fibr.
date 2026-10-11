"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import BodyMap from "@/components/BodyMap";
import BodyModel3D from "@/components/BodyModel3D";
import AppNav from "@/components/AppNav";
import {
  computeRecovery,
  pickNext,
  type LoggedExercise,
  type LoggedWorkout,
  type MuscleName,
  type MuscleStatus,
  type Suggestion,
} from "@/lib/recovery";

type HistoryWorkout = LoggedWorkout & { id: string };
type BoardRow = { user_id: string; username: string; volume: number };
type Stats = {
  workouts: number;
  workoutsNote: string;
  workoutsUp: boolean;
  volume: number;
  volumeNote: string;
  volumeUp: boolean;
  rank: string;
  rankNote: string;
};

const DAY = 24 * 60 * 60 * 1000;

const GROUPS: { name: string; muscles: MuscleName[] }[] = [
  { name: "Push", muscles: ["chest", "front-deltoids", "triceps"] },
  { name: "Pull", muscles: ["upper-back", "back-deltoids", "biceps", "trapezius", "forearm"] },
  { name: "Legs", muscles: ["quadriceps", "hamstring", "gluteal", "calves", "adductor", "abductors"] },
  { name: "Core", muscles: ["abs", "obliques", "lower-back"] },
];

// ---------- Helpers ----------

function statusColor(recovery: number) {
  if (recovery < 50) return "var(--status-fatigued)";
  if (recovery < 90) return "var(--status-recovering)";
  return "var(--status-ready)";
}

function statusText(s: MuscleStatus) {
  if (s.hoursLeft > 0) return `${s.hoursLeft}h left`;
  if (s.atrophy > 0) return `Ready · detraining ${s.atrophy}%`;
  return "Ready";
}

function statusTextColor(s: MuscleStatus) {
  if (s.hoursLeft > 0) return "var(--text-secondary)";
  if (s.atrophy > 0) return "var(--status-warning)";
  return "var(--status-ready)";
}

function lastTrainedText(days: number | null) {
  if (days === null) return "Not recently";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function volumeOf(w: LoggedWorkout) {
  return w.sets.reduce((total, s) => total + (s.reps ?? 0) * (s.weight_lbs ?? 0), 0);
}

function fmt(n: number) {
  return Math.round(n).toLocaleString();
}

// Names a session after the muscle group it hit most
function sessionName(w: LoggedWorkout) {
  const counts: Record<string, number> = {};
  for (const s of w.sets) {
    const m = s.exercises?.primary_muscles[0];
    const group = GROUPS.find((g) => m && g.muscles.includes(m as MuscleName));
    if (group) counts[group.name] = (counts[group.name] ?? 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return "Workout";
  if (ranked.length >= 3 && ranked[0][1] < w.sets.length / 2) return "Full Body";
  const names: Record<string, string> = { Push: "Push Day", Pull: "Pull Day", Legs: "Leg Day", Core: "Core Day" };
  return names[ranked[0][0]] ?? "Workout";
}

function formatWhen(iso: string, now: Date) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === new Date(now.getTime() - DAY).toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

// ---------- Icons (inline SVG, same shapes as the Figma) ----------

function Icon({
  children,
  size = 24,
  strokeWidth = 2,
  className = "",
}: {
  children: ReactNode;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  trending: (
    <>
      <path d="m22 7-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </>
  ),
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  award: (
    <>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </>
  ),
  dumbbell: <path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
};

// ---------- Small pieces ----------

function StatCard({
  label,
  value,
  note,
  noteColor,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  noteColor: string;
  icon: ReactNode;
}) {
  return (
    <div className="fibr-stat">
      <div className="relative z-10">
        <p className="fibr-label">{label}</p>
        <p className="mt-2 text-[32px] font-black leading-tight tracking-tight">{value}</p>
        <p className="mt-2 text-[13px] font-medium" style={{ color: noteColor }}>
          {note}
        </p>
      </div>
      <Icon size={64} strokeWidth={1.6} className="fibr-watermark absolute right-8 top-1/2 -translate-y-1/2">
        {icon}
      </Icon>
    </div>
  );
}

// Ring split into 5 sections; filled sections = recovery
function Gauge({ pct, color }: { pct: number; color: string }) {
  const filled = Math.round((pct / 100) * 5);
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const section = circumference / 5;
  const gap = 6;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 shrink-0" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <circle
          key={i}
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="8"
          stroke={i < filled ? color : "var(--border-strong)"}
          strokeDasharray={`${section - gap} ${circumference - (section - gap)}`}
          strokeDashoffset={-i * section}
        />
      ))}
    </svg>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full" style={{ background: "var(--border-subtle)" }}>
      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ---------- Dashboard ----------

export default function Dashboard() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [statuses, setStatuses] = useState<MuscleStatus[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [history, setHistory] = useState<HistoryWorkout[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [openMuscle, setOpenMuscle] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      const userId = data.user.id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, experience")
        .eq("id", userId)
        .single();

      const nowMs = Date.now();
      const since = new Date(nowMs - 60 * DAY).toISOString();

      const [{ data: hist }, { data: exerciseList }, board] = await Promise.all([
        supabase
          .from("workouts")
          .select("id, performed_at, sets(reps, weight_lbs, exercises(name, primary_muscles, secondary_muscles))")
          .gte("performed_at", since)
          .order("performed_at", { ascending: false }),
        supabase.from("exercises").select("name, primary_muscles, secondary_muscles"),
        supabase.rpc("friend_leaderboard"),
      ]);

      const workouts = (hist ?? []) as unknown as HistoryWorkout[];

      // Recovery engine
      const results = computeRecovery(workouts, profile?.experience ?? "beginner", nowMs);
      const next = pickNext(results, (exerciseList ?? []) as LoggedExercise[]);

      // This week vs last week
      const between = (w: LoggedWorkout, from: number, to: number) => {
        const t = new Date(w.performed_at).getTime();
        return t >= from && t <= to;
      };
      const thisWeek = workouts.filter((w) => between(w, nowMs - 7 * DAY, nowMs));
      const lastWeek = workouts.filter((w) => between(w, nowMs - 14 * DAY, nowMs - 7 * DAY));
      const volume = thisWeek.reduce((t, w) => t + volumeOf(w), 0);
      const prevVolume = lastWeek.reduce((t, w) => t + volumeOf(w), 0);
      const diff = thisWeek.length - lastWeek.length;

      // Rank among friends (by this week's volume)
      const rows = ((board.data ?? []) as BoardRow[])
        .map((r) => ({ ...r, volume: Number(r.volume) }))
        .sort((a, b) => b.volume - a.volume);
      const me = rows.findIndex((r) => r.user_id === userId);
      let rank = "—";
      let rankNote = "Add friends to compete";
      if (rows.length > 1 && me >= 0) {
        rank = `#${me + 1} of ${rows.length}`;
        rankNote =
          me === 0
            ? `Leading by ${fmt(rows[0].volume - rows[1].volume)} lbs`
            : `${fmt(rows[me - 1].volume - rows[me].volume)} lbs behind ${rows[me - 1].username}`;
      }

      setUsername(profile?.username ?? data.user.email ?? "");
      setNow(new Date(nowMs));
      setStatuses(results);
      setSuggestions(next);
      setHistory(workouts);
      setStats({
        workouts: thisWeek.length,
        workoutsNote: diff === 0 ? "Same as last week" : `${diff > 0 ? "+" : ""}${diff} vs last week`,
        workoutsUp: diff > 0,
        volume,
        volumeNote:
          prevVolume === 0
            ? volume > 0
              ? "First week on the board"
              : "No volume logged yet"
            : `${volume >= prevVolume ? "+" : ""}${Math.round(((volume - prevVolume) / prevVolume) * 100)}% vs last week`,
        volumeUp: volume > prevVolume,
        rank,
        rankNote,
      });

      // Start with the most fatigued muscle selected
      const mostFatigued = [...results].sort((a, b) => a.recovery - b.recovery)[0];
      setSelected(mostFatigued?.muscle ?? null);
      setLoaded(true);
    }
    load();
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function deleteWorkout(id: string) {
    if (!confirm("Delete this workout?")) return;
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    if (error) alert(error.message);
    else window.location.reload();
  }

  async function clearAllWorkouts() {
    if (!confirm("Delete ALL your workouts? This can't be undone.")) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { error } = await supabase.from("workouts").delete().eq("user_id", data.user.id);
    if (error) alert(error.message);
    else window.location.reload();
  }

  if (!loaded || !now || !stats) {
    return (
      <main className="fibr grid place-items-center">
        <p className="fibr-muted">Loading your recovery map...</p>
      </main>
    );
  }

  const byMuscle = Object.fromEntries(statuses.map((s) => [s.muscle, s])) as Record<string, MuscleStatus>;
  const ready = statuses.filter((s) => s.recovery >= 90).length;
  const recovering = statuses.filter((s) => s.recovery >= 50 && s.recovery < 90).length;
  const fatigued = statuses.filter((s) => s.recovery < 50).length;
  const sel = selected ? byMuscle[selected] : undefined;
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const startExercises = suggestions.flatMap((s) => s.exercises);
  const startHref = startExercises.length
    ? `/log?exercises=${encodeURIComponent(startExercises.join(","))}`
    : "/log";

  return (
    <main className="fibr">
      <AppNav active="/dashboard" username={username} />

      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-8 md:px-12 md:py-12">
        {/* Greeting */}
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">
              {greeting}, {username}
            </h1>
            <p className="fibr-muted text-[15px]">
              {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {ready} muscles
              ready to train
            </p>
          </div>
          <Link href="/log" className="fibr-btn">
            <Icon size={18}>{ICONS.plus}</Icon>
            Log workout
          </Link>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Workouts this week"
            value={String(stats.workouts)}
            note={stats.workoutsNote}
            noteColor={stats.workoutsUp ? "var(--status-ready)" : "var(--text-secondary)"}
            icon={ICONS.calendar}
          />
          <StatCard
            label="Volume this week"
            value={`${fmt(stats.volume)} lbs`}
            note={stats.volumeNote}
            noteColor={stats.volumeUp ? "var(--status-ready)" : "var(--text-secondary)"}
            icon={ICONS.trending}
          />
          <StatCard
            label="Muscles ready"
            value={`${ready} / ${statuses.length}`}
            note={`${recovering} recovering · ${fatigued} fatigued`}
            noteColor="var(--text-secondary)"
            icon={ICONS.zap}
          />
          <StatCard
            label="Friend rank"
            value={stats.rank}
            note={stats.rankNote}
            noteColor="var(--text-secondary)"
            icon={ICONS.award}
          />
        </section>

        {/* Overview: recovery map + train next */}
        <section className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          {/* Recovery map */}
          <div className="fibr-card space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="fibr-heading">Recovery map</h2>
                <p className="fibr-muted text-[13px]">Drag to spin · tap a muscle to inspect it</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["var(--status-ready)", `${ready} ready`],
                  ["var(--status-recovering)", `${recovering} recovering`],
                  ["var(--status-fatigued)", `${fatigued} fatigued`],
                ].map(([color, text]) => (
                  <span key={text} className="fibr-pill">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-8 md:flex-row">
              <BodyModel3D
                statuses={statuses}
                selected={selected}
                onSelect={(m) => byMuscle[m] && setSelected(m)}
                fallback={<BodyMap statuses={statuses} onSelect={(m) => byMuscle[m] && setSelected(m)} />}
              />

              {sel && (
                <div className="fibr-panel w-full space-y-4 p-4 md:w-60">
                  <p className="fibr-label">Selected</p>
                  <p className="text-2xl font-black uppercase tracking-wide">{sel.label}</p>
                  <p className="flex items-baseline gap-2">
                    <span className="text-[34px] font-black tracking-tight" style={{ color: statusColor(sel.recovery) }}>
                      {sel.recovery}%
                    </span>
                    <span className="fibr-muted text-[13px] font-medium">recovered</span>
                  </p>
                  <Bar pct={sel.recovery} color={statusColor(sel.recovery)} />
                  <dl className="space-y-2 text-[13px]">
                    {[
                      ["Ready in", sel.hoursLeft > 0 ? `~${sel.hoursLeft} hours` : "Now"],
                      ["Last trained", lastTrainedText(sel.daysSinceTrained)],
                      ["Detraining", sel.atrophy > 0 ? `${sel.atrophy}% (est.)` : "None"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <dt className="fibr-muted">{k}</dt>
                        <dd className="font-semibold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </div>

          {/* Train next */}
          <div className="fibr-card flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="fibr-heading">Train next</h2>
              <p className="fibr-muted text-[13px]">Recovered muscles you&apos;ve neglected longest</p>
            </div>

            {suggestions.length === 0 ? (
              <p className="fibr-muted text-sm">Everything is still recovering. Rest day.</p>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s.muscle} className="fibr-row space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[15px] font-semibold">
                        <span className="h-2 w-2 rounded-full" style={{ background: "var(--status-ready)" }} />
                        {s.label}
                      </span>
                      <span className="fibr-muted text-xs font-medium">
                        {lastTrainedText(byMuscle[s.muscle]?.daysSinceTrained ?? null)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(s.exercises.length ? s.exercises : ["Any exercise that targets it"]).map((e) => (
                        <span key={e} className="fibr-chip">
                          {e}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-auto space-y-2">
              <Link href={startHref} className="fibr-btn w-full">
                Start workout
                <Icon size={18}>{ICONS.arrow}</Icon>
              </Link>
              <p className="fibr-muted text-xs">Built from what&apos;s fully recovered right now</p>
            </div>
          </div>
        </section>

        {/* All muscles, grouped and collapsible */}
        <section className="fibr-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="fibr-heading">All muscles</h2>
            <p className="fibr-muted text-[13px]">Tap a muscle for its fatigue gauge</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {GROUPS.map((group) => (
              <div key={group.name} className="space-y-2">
                <p className="fibr-label">{group.name}</p>
                {group.muscles.map((m) => {
                  const s = byMuscle[m];
                  if (!s) return null;
                  const open = openMuscle === m;
                  return (
                    <div key={m} className={`fibr-muscle ${open ? "is-open" : ""}`}>
                      <button
                        type="button"
                        onClick={() => setOpenMuscle(open ? null : m)}
                        aria-expanded={open}
                        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span className="h-2 w-2 rounded-full" style={{ background: statusColor(s.recovery) }} />
                          {s.label}
                        </span>
                        <span
                          className="flex items-center gap-2 text-[13px] font-medium"
                          style={{ color: statusTextColor(s) }}
                        >
                          {statusText(s)}
                          <Icon
                            size={16}
                            className={`fibr-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                          >
                            {ICONS.chevron}
                          </Icon>
                        </span>
                      </button>
                      {open && (
                        <div className="flex items-center gap-4 px-4 pb-4">
                          <Gauge pct={s.recovery} color={statusColor(s.recovery)} />
                          <div className="space-y-1">
                            <p className="flex items-center gap-2 text-[13px] font-medium">
                              <span className="h-2 w-2" style={{ background: statusColor(s.recovery) }} />
                              {s.recovery}% recovered
                            </p>
                            <p className="fibr-muted text-xs">5-section fatigue gauge</p>
                            <p className="fibr-faint text-xs">Last trained: {lastTrainedText(s.daysSinceTrained)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        {/* Recent workouts */}
        <section className="fibr-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="fibr-heading">Recent workouts</h2>
            {history.length > 0 && (
              <button
                onClick={clearAllWorkouts}
                className="text-[13px] font-medium hover:underline"
                style={{ color: "var(--status-fatigued)" }}
              >
                Clear all
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="fibr-row flex flex-wrap items-center justify-between gap-4 p-4">
              <p className="fibr-muted text-sm">No workouts yet. Log one and watch the map change.</p>
              <Link href="/log" className="fibr-btn">
                Log your first workout
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {history.slice(0, 5).map((w) => (
                <li key={w.id} className="fibr-row flex items-center justify-between gap-4 px-4 py-4">
                  <div>
                    <p className="text-[15px] font-semibold">{sessionName(w)}</p>
                    <p className="fibr-muted text-[13px]">{formatWhen(w.performed_at, now)}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <Icon size={40} strokeWidth={1.8} className="fibr-watermark-raised mr-6 hidden md:block">
                      {ICONS.dumbbell}
                    </Icon>
                    <span className="fibr-muted font-medium">{w.sets.length} sets</span>
                    <span className="hidden font-semibold sm:inline">{fmt(volumeOf(w))} lbs</span>
                    <button
                      onClick={() => deleteWorkout(w.id)}
                      className="fibr-muted text-[13px] font-medium hover:text-[var(--status-fatigued)]"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="fibr-faint text-center text-xs">
          Recovery and detraining figures are estimates, not medical advice.
        </p>
      </div>
    </main>
  );
}