"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type WorkoutSummary = {
  id: string;
  performed_at: string;
  sets: { count: number }[];
};

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);

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
        .select("username")
        .eq("id", data.user.id)
        .single();
      setUsername(profile?.username ?? null);

      // Last 5 workouts, with how many sets each had
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

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900 p-8">
      <h1 className="text-3xl font-bold">Welcome, {username ?? email}!</h1>
      <p className="mt-2 text-gray-600">The recovery map will go here.</p>

      <div className="mt-6 flex gap-3">
        <Link href="/log" className="bg-blue-600 text-white rounded-lg px-4 py-2 font-semibold">
          + Log workout
        </Link>
        <Link href="/profile" className="border border-blue-600 text-blue-600 rounded-lg px-4 py-2 font-semibold">
          Edit profile
        </Link>
      </div>

      <h2 className="mt-8 text-xl font-bold">Recent workouts</h2>
      {workouts.length === 0 ? (
        <p className="mt-2 text-gray-600">No workouts yet. Log your first one!</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {workouts.map((w) => (
            <li key={w.id} className="bg-white rounded-lg shadow p-3">
              {new Date(w.performed_at).toLocaleString()} · {w.sets[0]?.count ?? 0} sets
            </li>
          ))}
        </ul>
      )}

      <button onClick={handleSignOut} className="mt-8 bg-gray-800 text-white rounded-lg px-4 py-2">
        Sign out
      </button>
    </main>
  );
}