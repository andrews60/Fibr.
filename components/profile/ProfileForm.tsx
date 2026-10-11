"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppNav from "@/components/AppNav";
import Select, { type SelectOption } from "@/components/ui/Select";

const EXPERIENCE: SelectOption[] = [
  { value: "beginner", label: "Beginner", description: "Under 1 year · recovery windows +20%" },
  { value: "intermediate", label: "Intermediate", description: "1–3 years · standard recovery windows" },
  { value: "advanced", label: "Advanced", description: "3+ years · recovery windows −15%" },
];

const GOALS: SelectOption[] = [
  { value: "build muscle", label: "Build muscle", description: "Higher volume, moderate weight" },
  { value: "get stronger", label: "Get stronger", description: "Heavier sets, lower reps" },
  { value: "lose fat", label: "Lose fat", description: "Keep strength while cutting" },
  { value: "stay healthy", label: "Stay healthy", description: "General fitness and consistency" },
];

type Values = {
  username: string;
  feet: string;
  inches: string;
  weight: string;
  age: string;
  experience: string;
  goal: string;
};

type Profile = {
  username: string | null;
  height_in: number | null;
  weight_lbs: number | null;
  age: number | null;
  experience: string | null;
  goal: string | null;
  created_at: string | null;
};

type Summary = {
  workouts: number;
  routines: number;
  friends: number;
  memberSince: string;
};

function toValues(p: Profile | null): Values {
  const h = p?.height_in ?? null;
  return {
    username: p?.username ?? "",
    feet: h ? String(Math.floor(h / 12)) : "",
    inches: h ? String(Math.round(h % 12)) : "",
    weight: p?.weight_lbs != null ? String(p.weight_lbs) : "",
    age: p?.age != null ? String(p.age) : "",
    experience: p?.experience ?? "beginner",
    goal: p?.goal ?? "build muscle",
  };
}

function validate(v: Values): string | null {
  if (!/^[a-zA-Z0-9_.-]{2,30}$/.test(v.username.trim()))
    return "Usernames are 2–30 characters: letters, numbers, dots, dashes, or underscores.";
  if (v.inches && (Number(v.inches) < 0 || Number(v.inches) > 11)) return "Inches should be between 0 and 11.";
  if (v.weight && Number(v.weight) <= 0) return "Weight should be more than 0.";
  if (v.age && (Number(v.age) < 13 || Number(v.age) > 100)) return "Age should be between 13 and 100.";
  return null;
}

// ---------- Small pieces ----------

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="fibr-field-label">
        {label}
      </label>
      {children}
      {hint && <p className="fibr-hint">{hint}</p>}
    </div>
  );
}

function UnitInput({
  id,
  value,
  unit,
  onChange,
  ariaLabel,
}: {
  id?: string;
  value: string;
  unit: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={ariaLabel}
        className="fibr-input has-suffix"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="fibr-suffix">{unit}</span>
    </div>
  );
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <h2 className="fibr-label">{title}</h2>
      {note && <p className="fibr-faint text-[13px]">{note}</p>}
    </div>
  );
}

// ---------- Page ----------

export default function ProfileForm() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [values, setValues] = useState<Values | null>(null);
  const [initial, setInitial] = useState<Values | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      const uid = data.user.id;

      const [{ data: profile }, workouts, routines, friends] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, height_in, weight_lbs, age, experience, goal, created_at")
          .eq("id", uid)
          .single(),
        supabase.from("workouts").select("id", { count: "exact", head: true }),
        supabase.from("routines").select("id", { count: "exact", head: true }),
        supabase.from("friendships").select("id", { count: "exact", head: true }).eq("status", "accepted"),
      ]);

      const v = toValues(profile as Profile | null);
      setUserId(uid);
      setEmail(data.user.email ?? "");
      setValues(v);
      setInitial(v);
      setSummary({
        workouts: workouts.count ?? 0,
        routines: routines.count ?? 0,
        friends: friends.count ?? 0,
        memberSince: profile?.created_at
          ? new Date(profile.created_at).toLocaleDateString([], { month: "short", year: "numeric" })
          : "—",
      });
    }
    load();
  }, [router]);

  if (!values || !initial || !summary) {
    return (
      <main className="fibr grid place-items-center">
        <p className="fibr-muted">Loading your profile...</p>
      </main>
    );
  }

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const set = (key: keyof Values) => (v: string) => {
    setValues({ ...values, [key]: v });
    setError("");
  };

  async function handleSave() {
    if (!userId || !values) return;
    const problem = validate(values);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");

    const heightIn = values.feet || values.inches ? Number(values.feet || 0) * 12 + Number(values.inches || 0) : null;
    const { error } = await supabase
      .from("profiles")
      .update({
        username: values.username.trim(),
        height_in: heightIn,
        weight_lbs: values.weight ? Number(values.weight) : null,
        age: values.age ? Number(values.age) : null,
        experience: values.experience,
        goal: values.goal,
      })
      .eq("id", userId);
    setSaving(false);

    if (error) {
      setError(error.code === "23505" ? "That username is taken. Try another." : error.message);
      return;
    }
    const clean = { ...values, username: values.username.trim() };
    setValues(clean);
    setInitial(clean);
    setSavedAt(new Date());
  }

  const experienceLabel = EXPERIENCE.find((o) => o.value === initial.experience)?.label ?? "";
  const goalLabel = GOALS.find((o) => o.value === initial.goal)?.label ?? "";
  const status = dirty
    ? "Unsaved changes"
    : savedAt
    ? `Saved at ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "All changes saved";

  return (
    <main className="fibr">
      <AppNav active="/profile" username={initial.username} />

      <div className="mx-auto max-w-[1440px] space-y-8 px-4 py-8 md:px-12 md:py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Profile</h1>
          <p className="fibr-muted text-[15px]">Your stats tune how fast Fibr expects each muscle to recover.</p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[360px_1fr]">
          {/* Summary */}
          <aside className="fibr-card space-y-6">
            <div className="flex items-center gap-4">
              <div className="fibr-avatar" style={{ width: 64, height: 64, fontSize: 24, fontWeight: 900 }}>
                {initial.username.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="space-y-1">
                <p className="text-xl font-bold">{initial.username}</p>
                <p className="fibr-muted text-[13px]">
                  {experienceLabel} · {goalLabel}
                </p>
              </div>
            </div>

            <dl>
              {[
                ["Workouts logged", String(summary.workouts)],
                ["Routines saved", String(summary.routines)],
                ["Friends", String(summary.friends)],
                ["Member since", summary.memberSince],
              ].map(([k, v], i) => (
                <div
                  key={k}
                  className={`flex justify-between border-b py-4 ${i === 0 ? "border-t" : ""}`}
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <dt className="fibr-muted text-[13px]">{k}</dt>
                  <dd className="text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="fibr-row space-y-2 p-4">
              <p className="text-[13px] font-semibold">How Fibr uses this</p>
              <p className="fibr-muted text-xs leading-relaxed">
                Experience level sets your base recovery windows. Height, weight, and age stay private and never appear
                on the leaderboard.
              </p>
            </div>
          </aside>

          {/* Form */}
          <form
            className="fibr-card space-y-8"
            style={{ padding: 32 }}
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <section className="space-y-4">
              <SectionHeading title="Account" />
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Username" htmlFor="username" hint="Friends add you with this">
                  <input
                    id="username"
                    className="fibr-input"
                    value={values.username}
                    onChange={(e) => set("username")(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Email" htmlFor="email" hint="Managed by your sign-in">
                  <input id="email" className="fibr-input" value={email} disabled />
                </Field>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeading title="Training" note="Used to estimate recovery" />
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Experience" htmlFor="experience" hint="Sets your base recovery speed">
                  <Select id="experience" value={values.experience} options={EXPERIENCE} onChange={set("experience")} />
                </Field>
                <Field label="Goal" htmlFor="goal">
                  <Select id="goal" value={values.goal} options={GOALS} onChange={set("goal")} />
                </Field>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeading title="Body metrics" note="Private to you" />
              <div className="grid gap-6 sm:grid-cols-3">
                <Field label="Height" htmlFor="height-ft">
                  <div className="grid grid-cols-2 gap-2">
                    <UnitInput id="height-ft" value={values.feet} unit="ft" onChange={set("feet")} ariaLabel="Height, feet" />
                    <UnitInput value={values.inches} unit="in" onChange={set("inches")} ariaLabel="Height, inches" />
                  </div>
                </Field>
                <Field label="Weight" htmlFor="weight">
                  <UnitInput id="weight" value={values.weight} unit="lbs" onChange={set("weight")} />
                </Field>
                <Field label="Age" htmlFor="age">
                  <UnitInput id="age" value={values.age} unit="yrs" onChange={set("age")} />
                </Field>
              </div>
            </section>

            <footer
              className="flex flex-wrap items-center justify-between gap-4 border-t pt-6"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {error ? (
                <p className="fibr-error">{error}</p>
              ) : (
                <p className={`text-[13px] ${dirty ? "fibr-muted" : "fibr-faint"}`}>{status}</p>
              )}
              <div className="flex gap-4">
                <button
                  type="button"
                  className="fibr-btn-ghost"
                  disabled={!dirty || saving}
                  onClick={() => {
                    setValues(initial);
                    setError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="fibr-btn" disabled={!dirty || saving}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>
    </main>
  );
}