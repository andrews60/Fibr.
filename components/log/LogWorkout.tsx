"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppNav from "@/components/AppNav";
import Select, { type SelectOption } from "@/components/ui/Select";
import { MUSCLE_LABELS, type MuscleName } from "@/lib/recovery";

type Exercise = { id: number; name: string; primary_muscles: string[]; secondary_muscles: string[] };
type SetRow = { exerciseId: string; reps: string; weight: string }; // how routines are stored
type SetEntry = { reps: string; weight: string };
type Block = { key: string; exerciseId: string; sets: SetEntry[] };
type Routine = { id: string; name: string; sets: SetRow[] };

let keyCounter = 0;
const newKey = () => `block-${keyCounter++}`;
const emptySet = (): SetEntry => ({ reps: "", weight: "" });
const emptyBlock = (exerciseId = ""): Block => ({ key: newKey(), exerciseId, sets: [emptySet()] });

// The current date and time, formatted for the date picker
function nowForInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Saved routines are a flat list of sets; group them into one block per exercise
function rowsToBlocks(rows: SetRow[]): Block[] {
  const blocks: Block[] = [];
  for (const r of rows) {
    const last = blocks[blocks.length - 1];
    if (last && last.exerciseId === r.exerciseId) last.sets.push({ reps: r.reps, weight: r.weight });
    else blocks.push({ key: newKey(), exerciseId: r.exerciseId, sets: [{ reps: r.reps, weight: r.weight }] });
  }
  return blocks.length ? blocks : [emptyBlock()];
}

// And back again for saving
function blocksToRows(blocks: Block[]): SetRow[] {
  return blocks.flatMap((b) =>
    b.exerciseId
      ? b.sets.filter((s) => s.reps).map((s) => ({ exerciseId: b.exerciseId, reps: s.reps, weight: s.weight }))
      : []
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString();
const muscleLabel = (m: string) => MUSCLE_LABELS[m as MuscleName] ?? m;

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const PLUS = <path d="M12 5v14M5 12h14" />;
const X = <path d="M18 6 6 18M6 6l12 12" />;
const TRASH = (
  <>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>
);

export default function LogWorkout() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineId, setRoutineId] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [when, setWhen] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadRoutines() {
    const { data } = await supabase.from("routines").select("id, name, sets").order("name");
    setRoutines((data ?? []) as Routine[]);
  }

  useEffect(() => {
    setWhen(nowForInput());
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      const [{ data: profile }, { data: ex }, { data: rt }] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", data.user.id).single(),
        supabase.from("exercises").select("id, name, primary_muscles, secondary_muscles").order("name"),
        supabase.from("routines").select("id, name, sets").order("name"),
      ]);
      const list = (ex ?? []) as Exercise[];
      setUsername(profile?.username ?? data.user.email ?? "");
      setExercises(list);
      setRoutines((rt ?? []) as Routine[]);

      // Coming from the dashboard's "Start workout"? (?exercises=Pull-Up,Barbell Row)
      const wanted = new URLSearchParams(window.location.search).get("exercises");
      const prefill = wanted
        ? wanted
            .split(",")
            .map((name) => list.find((e) => e.name === name.trim()))
            .filter((e): e is Exercise => !!e)
            .map((e) => emptyBlock(String(e.id)))
        : [];
      setBlocks(prefill.length ? prefill : [emptyBlock()]);
      setLoaded(true);
    }
    load();
  }, [router]);

  if (!loaded) {
    return (
      <main className="fibr grid place-items-center">
        <p className="fibr-muted">Loading the logger...</p>
      </main>
    );
  }

  // ---------- Editing ----------
  const clearMessages = () => {
    setError("");
    setNotice("");
  };
  const updateBlock = (key: string, fn: (b: Block) => Block) => {
    clearMessages();
    setBlocks((bs) => bs.map((b) => (b.key === key ? fn(b) : b)));
  };
  const setExercise = (key: string, id: string) => updateBlock(key, (b) => ({ ...b, exerciseId: id }));
  const updateSet = (key: string, i: number, field: keyof SetEntry, value: string) =>
    updateBlock(key, (b) => ({ ...b, sets: b.sets.map((s, j) => (j === i ? { ...s, [field]: value } : s)) }));
  const addSet = (key: string) =>
    updateBlock(key, (b) => ({ ...b, sets: [...b.sets, { ...b.sets[b.sets.length - 1] }] }));
  const removeSet = (key: string, i: number) =>
    updateBlock(key, (b) => (b.sets.length > 1 ? { ...b, sets: b.sets.filter((_, j) => j !== i) } : b));
  const removeBlock = (key: string) => {
    clearMessages();
    setBlocks((bs) => (bs.length > 1 ? bs.filter((b) => b.key !== key) : [emptyBlock()]));
  };
  const addBlock = () => {
    clearMessages();
    setBlocks((bs) => [...bs, emptyBlock()]);
  };
  function chooseRoutine(id: string) {
    clearMessages();
    setRoutineId(id);
    const r = routines.find((x) => x.id === id);
    if (!r) {
      setBlocks([emptyBlock()]);
      setRoutineName("");
      return;
    }
    setBlocks(rowsToBlocks(r.sets));
    setRoutineName(r.name);
  }

  // ---------- Live session summary ----------
  const exById = Object.fromEntries(exercises.map((e) => [String(e.id), e]));
  const rows = blocksToRows(blocks);
  const volume = rows.reduce((t, r) => t + Number(r.reps) * Number(r.weight || 0), 0);
  const heaviest = rows.reduce<SetRow | null>(
    (best, r) => (!best || Number(r.weight || 0) > Number(best.weight || 0) ? r : best),
    null
  );
  const chosen = blocks.map((b) => exById[b.exerciseId]).filter(Boolean);
  const primary = new Set<string>();
  const assisting = new Set<string>();
  chosen.forEach((e) => e.primary_muscles.forEach((m) => primary.add(m)));
  chosen.forEach((e) => e.secondary_muscles.forEach((m) => !primary.has(m) && assisting.add(m)));

  const routineOptions: SelectOption[] = [
    { value: "", label: "Start fresh", description: "Empty workout" },
    ...routines.map((r) => ({ value: r.id, label: r.name, description: `${r.sets.length} sets` })),
  ];
  const exerciseOptions: SelectOption[] = exercises.map((e) => ({
    value: String(e.id),
    label: e.name,
    description: e.primary_muscles.map(muscleLabel).join(", "),
  }));
  const loadedRoutine = routines.find((r) => r.id === routineId);

  // ---------- Saving ----------
  async function saveRoutine(userId: string, toSave: SetRow[]) {
    const name = routineName.trim();
    const existing = routines.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (existing) return (await supabase.from("routines").update({ sets: toSave }).eq("id", existing.id)).error;
    return (await supabase.from("routines").insert({ user_id: userId, name, sets: toSave })).error;
  }

  async function handleSaveWorkout() {
    clearMessages();
    if (!rows.length) {
      setError("Add at least one set with an exercise and reps.");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    // 1. The workout
    const { data: workout, error: wErr } = await supabase
      .from("workouts")
      .insert({ user_id: u.user.id, performed_at: new Date(when || Date.now()).toISOString() })
      .select()
      .single();
    if (wErr || !workout) {
      setError(wErr?.message ?? "Could not save the workout.");
      setSaving(false);
      return;
    }

    // 2. One row per set, numbered within each exercise
    const counts: Record<string, number> = {};
    const setsToSave = rows.map((r) => {
      counts[r.exerciseId] = (counts[r.exerciseId] ?? 0) + 1;
      return {
        workout_id: workout.id,
        exercise_id: Number(r.exerciseId),
        set_number: counts[r.exerciseId],
        reps: Number(r.reps),
        weight_lbs: r.weight ? Number(r.weight) : 0,
      };
    });
    const { error: sErr } = await supabase.from("sets").insert(setsToSave);
    if (sErr) {
      setError(sErr.message);
      setSaving(false);
      return;
    }

    // 3. Optionally save as a routine
    if (routineName.trim()) {
      const rErr = await saveRoutine(u.user.id, rows);
      if (rErr) {
        setError(`Workout saved, but the routine didn't: ${rErr.message}`);
        setSaving(false);
        return;
      }
    }
    router.push("/dashboard");
  }

  async function handleSaveRoutineOnly() {
    clearMessages();
    if (!routineName.trim()) {
      setError("Give the routine a name first.");
      return;
    }
    if (!rows.length) {
      setError("Add at least one set with an exercise and reps.");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    const rErr = await saveRoutine(u.user.id, rows);
    setSaving(false);
    if (rErr) setError(rErr.message);
    else {
      setNotice(`Saved "${routineName.trim()}" to your routines.`);
      await loadRoutines();
    }
  }

  return (
    <main className="fibr">
      <AppNav active="/log" username={username} />

      <div className="mx-auto max-w-[1440px] space-y-8 px-4 py-8 md:px-12 md:py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Log workout</h1>
          <p className="fibr-muted text-[15px]">Log as you go, or fill it in after.</p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
          {/* ---------- Main column ---------- */}
          <div className="space-y-6">
            {/* Session */}
            <section className="fibr-card space-y-4">
              <h2 className="fibr-label">Session</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="routine" className="fibr-field-label">Start from a routine</label>
                  <Select id="routine" value={routineId} options={routineOptions} onChange={chooseRoutine} />
                  <p className="fibr-hint">
                    {loadedRoutine
                      ? `Filled in from ${loadedRoutine.name} · change anything before saving`
                      : routines.length
                      ? "Pick a saved routine to fill everything in"
                      : "Save a routine below to reuse it next time"}
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="when" className="fibr-field-label">When</label>
                  <input id="when" type="datetime-local" className="fibr-input" value={when}
                    onChange={(e) => setWhen(e.target.value)} />
                  <p className="fibr-hint">Change the time to log a past workout</p>
                </div>
              </div>
            </section>

            {/* One card per exercise */}
            {blocks.map((block, n) => {
              const ex = exById[block.exerciseId];
              const muscles = ex ? [...ex.primary_muscles, ...ex.secondary_muscles].map(muscleLabel).join(" · ") : "";
              const blockRows = block.sets.filter((s) => s.reps);
              const blockVolume = blockRows.reduce((t, s) => t + Number(s.reps) * Number(s.weight || 0), 0);
              return (
                <section key={block.key} className="fibr-card space-y-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="fibr-badge">{n + 1}</span>
                    <div className="w-full sm:w-80">
                      <Select value={block.exerciseId} options={exerciseOptions}
                        onChange={(id) => setExercise(block.key, id)} />
                    </div>
                    {muscles && <p className="fibr-faint text-[13px]">{muscles}</p>}
                    <button type="button" className="fibr-icon-btn ml-auto" aria-label="Remove exercise"
                      onClick={() => removeBlock(block.key)}>
                      <Icon size={18}>{TRASH}</Icon>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 sm:grid-cols-[48px_160px_200px_1fr_32px] sm:gap-4">
                      <span className="fibr-label">Set</span>
                      <span className="fibr-label">Reps</span>
                      <span className="fibr-label">Weight</span>
                      <span className="fibr-label hidden sm:block">Volume</span>
                      <span />
                    </div>
                    {block.sets.map((s, i) => {
                      const setVolume = s.reps && s.weight ? Number(s.reps) * Number(s.weight) : 0;
                      return (
                        <div key={i}
                          className="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2 sm:grid-cols-[48px_160px_200px_1fr_32px] sm:gap-4">
                          <span className="fibr-muted text-sm font-semibold">{i + 1}</span>
                          <input type="number" inputMode="numeric" min={0} aria-label={`Set ${i + 1} reps`}
                            className="fibr-input" value={s.reps}
                            onChange={(e) => updateSet(block.key, i, "reps", e.target.value)} />
                          <div className="relative">
                            <input type="number" inputMode="decimal" min={0} aria-label={`Set ${i + 1} weight`}
                              className="fibr-input has-suffix" value={s.weight}
                              onChange={(e) => updateSet(block.key, i, "weight", e.target.value)} />
                            <span className="fibr-suffix">lbs</span>
                          </div>
                          <span className="fibr-muted hidden text-sm font-medium sm:block">
                            {setVolume ? `${fmt(setVolume)} lbs` : "—"}
                          </span>
                          <button type="button" className="fibr-icon-btn" aria-label={`Remove set ${i + 1}`}
                            disabled={block.sets.length === 1} onClick={() => removeSet(block.key, i)}>
                            <Icon>{X}</Icon>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button type="button" className="fibr-text-btn" onClick={() => addSet(block.key)}>
                      <Icon>{PLUS}</Icon>
                      Add set
                    </button>
                    <p className="fibr-muted text-[13px] font-medium">
                      {blockRows.length} sets · {fmt(blockVolume)} lbs
                    </p>
                  </div>
                </section>
              );
            })}

            <button type="button" className="fibr-dashed" onClick={addBlock}>
              <Icon>{PLUS}</Icon>
              Add exercise
            </button>
          </div>

          {/* ---------- This session ---------- */}
          <aside className="fibr-card space-y-6 lg:sticky lg:top-6">
            <h2 className="fibr-label">This session</h2>
            <div className="space-y-2">
              <p className="text-[32px] font-black leading-tight tracking-tight">{fmt(volume)} lbs</p>
              <p className="fibr-muted text-[13px]">Total volume</p>
            </div>

            <dl>
              {[
                ["Exercises", String(chosen.length)],
                ["Sets", String(rows.length)],
                ["Heaviest set", heaviest && Number(heaviest.weight) ? `${heaviest.reps} × ${heaviest.weight} lbs` : "—"],
              ].map(([k, v], i) => (
                <div key={k} className={`flex justify-between border-b py-4 ${i === 0 ? "border-t" : ""}`}
                  style={{ borderColor: "var(--border-subtle)" }}>
                  <dt className="fibr-muted text-[13px]">{k}</dt>
                  <dd className="text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-4">
              <h3 className="fibr-label">Muscles hit</h3>
              {primary.size === 0 ? (
                <p className="fibr-faint text-xs">Pick an exercise to see which muscles it works.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {[...primary].map((m) => <span key={m} className="fibr-chip-primary">{muscleLabel(m)}</span>)}
                    {[...assisting].map((m) => <span key={m} className="fibr-chip-outline">{muscleLabel(m)}</span>)}
                  </div>
                  <p className="fibr-faint text-xs leading-relaxed">
                    Primary muscles are highlighted. These turn red on your recovery map once you save.
                  </p>
                </>
              )}
            </div>

            <div className="space-y-2 border-t pt-6" style={{ borderColor: "var(--border-subtle)" }}>
              <label htmlFor="routine-name" className="fibr-field-label">Save as routine</label>
              <input id="routine-name" className="fibr-input" placeholder="e.g. Push Day" value={routineName}
                onChange={(e) => {
                  setRoutineName(e.target.value);
                  clearMessages();
                }} />
              <p className="fibr-hint">Same name updates your saved routine</p>
            </div>

            {error && <p className="fibr-error">{error}</p>}
            {notice && <p className="text-[13px]" style={{ color: "var(--status-ready)" }}>{notice}</p>}

            <div className="space-y-2">
              <button type="button" className="fibr-btn w-full" disabled={saving} onClick={handleSaveWorkout}>
                {saving ? "Saving..." : "Save workout"}
              </button>
              <button type="button" className="fibr-btn-ghost w-full" disabled={saving} onClick={handleSaveRoutineOnly}>
                Save routine only
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
