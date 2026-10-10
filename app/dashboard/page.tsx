"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import BodyMap from "@/components/BodyMap";
import {
  computeRecovery,
  pickNext,
  type LoggedExercise,
  type LoggedWorkout,
  type MuscleStatus,
  type Suggestion,
} from "@/lib/recovery";

type WorkoutSummary = {
  id: string;
  performed_at: string;
  sets: { count: number }[];
};

function barColor(recovery: number) {
  if (recovery < 50) return "bg-red-500";
  if (recovery < 90) return "bg-yellow-500";
  return "bg-green-500";
}

function describe(s: MuscleStatus) {
  const ready = s.hoursLeft > 0 ? `ready in ~${s.hoursLeft}h` : "ready to train";
  const last =
    s.daysSinceTrained === null
      ? "not trained recently"
      : s.daysSinceTrained === 0
      ? "trained today"
      : `trained ${s.daysSinceTrained}d ago`;
  return `${s.recovery}% recovered · ${ready} · ${last}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [statuses, setStatuses] = useState<MuscleStatus[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setEmail(data.user.email ?? null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, experience")
        .eq("id", data.user.id)
        .single();
      setUsername(profile?.username ?? null);

      // Every workout from the last 60 days, with each set and its exercise's muscles
      const now = Date.now();
      const since = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data: history } = await supabase
        .from("workouts")
        .select("performed_at, sets(reps, weight_lbs, exercises(name, primary_muscles, secondary_muscles))")
        .gte("performed_at", since);

      const { data: exerciseList } = await supabase
        .from("exercises")
        .select("name, primary_muscles, secondary_muscles");

      // Run the recovery engine
      const results = computeRecovery(
        (history ?? []) as unknown as LoggedWorkout[],
        profile?.experience ?? "beginner",
        now
      );
      setStatuses(results);
      setSuggestions(pickNext(results, (exerciseList ?? []) as LoggedExercise[]));

      // Last 5 workouts for the history list
      const { data: recent } = await supabase
        .from("workouts")
        .select("id, performed_at, sets(count)")
        .order("performed_at", { ascending: false })
        .limit(5);
      setWorkouts((recent ?? []) as WorkoutSummary[]);
    }
    load();
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!email) return <p className="p-8">Loading...</p>;

  const selectedStatus = statuses.find((s) => s.muscle === selected);
  const sortedStatuses = [...statuses].sort((a, b) => a.recovery - b.recovery);

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Welcome, {username ?? email}!</h1>
          <div className="flex gap-2">
            <Link href="/log" className="bg-blue-600 text-white rounded-lg px-4 py-2 font-semibold">
              + Log workout
            </Link>
            <Link href="/profile" className="border border-blue-600 text-blue-600 rounded-lg px-4 py-2 font-semibold">
              Profile
            </Link>
            <button onClick={handleSignOut} className="bg-gray-800 text-white rounded-lg px-4 py-2">
              Sign out
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Body map */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold mb-4">Recovery map</h2>
            <BodyMap statuses={statuses} onSelect={setSelected} />
            {/* key changes with the selection, so the <p> remounts and the fade replays */}
            <p
              key={selectedStatus?.muscle ?? "empty"}
              className="mt-4 min-h-[2.5rem] text-sm text-center text-gray-600 animate-[fadeIn_250ms_ease-out]"
            >
              {selectedStatus
                ? `${selectedStatus.label}: ${describe(selectedStatus)}`
                : "Tap a muscle for details."}
            </p>
          </div>

          {/* Train next */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold mb-4">Train next</h2>
            {suggestions.length === 0 ? (
              <p className="text-gray-600">Everything is still recovering. Rest day!</p>
            ) : (
              <ul className="space-y-3">
                {suggestions.map((s) => (
                  <li key={s.muscle} className="border rounded-lg p-3">
                    <p className="font-semibold">{s.label}</p>
                    <p className="text-sm text-gray-600">
                      {s.exercises.length > 0 ? s.exercises.join(" · ") : "Any exercise that targets it"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* All muscles */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold mb-4">All muscles</h2>
          <ul className="space-y-3">
            {sortedStatuses.map((s) => (
              <li key={s.muscle}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{s.label}</span>
                  <span className="text-gray-600">
                    {s.hoursLeft > 0 ? `${s.hoursLeft}h left` : "Ready"}
                    {s.atrophy > 0 && ` · ⚠ detraining est. ${s.atrophy}%`}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full mt-1">
                  <div
                    className={`h-2 rounded-full ${barColor(s.recovery)}`}
                    style={{ width: `${s.recovery}%` }}
                  ></div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Recent workouts */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold mb-4">Recent workouts</h2>
          {workouts.length === 0 ? (
            <p className="text-gray-600">No workouts yet. Log your first one!</p>
          ) : (
            <ul className="space-y-2">
              {workouts.map((w) => (
                <li key={w.id} className="border rounded-lg p-3">
                  {new Date(w.performed_at).toLocaleString()} · {w.sets[0]?.count ?? 0} sets
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-center text-gray-500">
          Recovery and detraining figures are estimates, not medical advice.
        </p>
      </div>
    </main>
  );
}
