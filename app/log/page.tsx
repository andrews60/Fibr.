"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Exercise = { id: number; name: string };
type SetRow = { exerciseId: string; reps: string; weight: string };

// The current date and time, formatted for the date picker
function nowForInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function LogPage() {
  const router = useRouter();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [rows, setRows] = useState<SetRow[]>([{ exerciseId: "", reps: "", weight: "" }]);
  const [when, setWhen] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Load the exercise list for the dropdowns
    useEffect(() => {
    setWhen(nowForInput());
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      const { data: ex } = await supabase.from("exercises").select("id, name").order("name");
      setExercises(ex ?? []);
    }
    load();
  }, [router]);

  function updateRow(i: number, field: keyof SetRow, value: string) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  // New set copies the previous one, so repeating a set is one click
  function addSet() {
    setRows([...rows, { ...rows[rows.length - 1] }]);
  }

  function removeSet(i: number) {
    if (rows.length === 1) return;
    setRows(rows.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setMessage("");
    const filled = rows.filter((r) => r.exerciseId && r.reps);
    if (filled.length === 0) {
      setMessage("Add at least one set with an exercise and reps.");
      return;
    }
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    // 1. Create the workout
    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .insert({ user_id: userData.user.id, performed_at: new Date(when).toISOString() })
      .select()
      .single();

    if (workoutError || !workout) {
      setMessage(workoutError?.message ?? "Could not save workout.");
      setSaving(false);
      return;
    }

    // 2. Create one row per set, numbering sets within each exercise
    const counts: Record<string, number> = {};
    const setsToSave = filled.map((r) => {
      counts[r.exerciseId] = (counts[r.exerciseId] ?? 0) + 1;
      return {
        workout_id: workout.id,
        exercise_id: Number(r.exerciseId),
        set_number: counts[r.exerciseId],
        reps: Number(r.reps),
        weight_lbs: r.weight ? Number(r.weight) : 0,
      };
    });

    const { error: setsError } = await supabase.from("sets").insert(setsToSave);
    setSaving(false);

    if (setsError) setMessage(setsError.message);
    else router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900 p-4 flex justify-center">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold">Log a workout</h1>

        <label className="block">
          <span className="text-sm font-semibold">When</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </label>

        <div className="space-y-2">
          <div className="flex gap-2 text-sm font-semibold">
            <span className="flex-1">Exercise</span>
            <span className="w-20">Reps</span>
            <span className="w-24">Weight (lbs)</span>
            <span className="w-8"></span>
          </div>

          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <select
                value={row.exerciseId}
                onChange={(e) => updateRow(i, "exerciseId", e.target.value)}
                className="flex-1 border rounded-lg p-2"
              >
                <option value="">Pick exercise</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={row.reps}
                onChange={(e) => updateRow(i, "reps", e.target.value)}
                className="w-20 border rounded-lg p-2"
              />
              <input
                type="number"
                value={row.weight}
                onChange={(e) => updateRow(i, "weight", e.target.value)}
                className="w-24 border rounded-lg p-2"
              />
              <button onClick={() => removeSet(i)} className="w-8 text-gray-400 hover:text-red-600">
                ✕
              </button>
            </div>
          ))}
        </div>

        <button onClick={addSet} className="w-full border border-blue-600 text-blue-600 rounded-lg p-2 font-semibold">
          + Add set
        </button>

        {message && <p className="text-red-600 text-sm">{message}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 text-white rounded-lg p-2 font-semibold disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save workout"}
        </button>
      </div>
    </main>
  );
}