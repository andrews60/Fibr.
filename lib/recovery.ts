// Fibr recovery engine: turns logged sets into a recovery estimate per muscle.
// These are estimates from simple rules, not medical measurements.

export const MUSCLES = [
  "chest", "front-deltoids", "back-deltoids", "triceps", "biceps", "forearm",
  "trapezius", "upper-back", "lower-back", "abs", "obliques", "quadriceps",
  "hamstring", "gluteal", "calves", "adductor", "abductors",
] as const;

export type MuscleName = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<MuscleName, string> = {
  chest: "Chest",
  "front-deltoids": "Front delts",
  "back-deltoids": "Rear delts",
  triceps: "Triceps",
  biceps: "Biceps",
  forearm: "Forearms",
  trapezius: "Traps",
  "upper-back": "Upper back",
  "lower-back": "Lower back",
  abs: "Abs",
  obliques: "Obliques",
  quadriceps: "Quads",
  hamstring: "Hamstrings",
  gluteal: "Glutes",
  calves: "Calves",
  adductor: "Adductors",
  abductors: "Abductors",
};

// Hours each muscle needs to recover from a normal session (about 4 hard sets)
const BASE_HOURS: Record<MuscleName, number> = {
  chest: 60,
  "front-deltoids": 48,
  "back-deltoids": 36,
  triceps: 48,
  biceps: 48,
  forearm: 36,
  trapezius: 48,
  "upper-back": 60,
  "lower-back": 72,
  abs: 36,
  obliques: 36,
  quadriceps: 72,
  hamstring: 72,
  gluteal: 72,
  calves: 36,
  adductor: 48,
  abductors: 48,
};

// Beginners take longer to recover, advanced lifters a bit less
const EXPERIENCE_FACTOR: Record<string, number> = {
  beginner: 1.2,
  intermediate: 1.0,
  advanced: 0.85,
};

export type LoggedExercise = {
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
};

export type LoggedSet = {
  reps: number;
  weight_lbs: number;
  exercises: LoggedExercise | null;
};

export type LoggedWorkout = {
  performed_at: string;
  sets: LoggedSet[];
};

export type MuscleStatus = {
  muscle: MuscleName;
  label: string;
  recovery: number; // 0 to 100
  hoursLeft: number; // hours until fully recovered
  daysSinceTrained: number | null; // null = not trained recently
  atrophy: number; // 0 to 100 detraining estimate
};

export type Suggestion = {
  muscle: MuscleName;
  label: string;
  exercises: string[];
};

const HOUR = 1000 * 60 * 60;

export function computeRecovery(
  workouts: LoggedWorkout[],
  experience: string,
  now: number
): MuscleStatus[] {
  const expFactor = EXPERIENCE_FACTOR[experience] ?? 1;

  return MUSCLES.map((muscle) => {
    let fatigue = 0; // 1 = just trained, 0 = fully recovered
    let hoursLeft = 0;
    let lastTrained: number | null = null;

    for (const workout of workouts) {
      // 1. How hard did this workout hit this muscle?
      let stimulus = 0;
      for (const set of workout.sets) {
        if (!set.exercises) continue;
        if (set.exercises.primary_muscles.includes(muscle)) stimulus += 1;
        else if (set.exercises.secondary_muscles.includes(muscle)) stimulus += 0.5;
      }
      if (stimulus === 0) continue;

      const time = new Date(workout.performed_at).getTime();
      if (time > now) continue; // ignore workouts dated in the future
      if (lastTrained === null || time > lastTrained) lastTrained = time;

      // 2. How long does it need? More sets = longer recovery
      const volumeFactor = Math.min(1.5, Math.max(0.7, 0.6 + 0.1 * stimulus));
      const windowHours = BASE_HOURS[muscle] * volumeFactor * expFactor;

      // 3. How much of that time has passed?
      const hoursSince = (now - time) / HOUR;
      fatigue = Math.max(fatigue, Math.max(0, 1 - hoursSince / windowHours));
      hoursLeft = Math.max(hoursLeft, windowHours - hoursSince);
    }

    // 4. Detraining: starts after 7 days off, reaches 100 at 4 weeks
    const daysSince = lastTrained === null ? null : (now - lastTrained) / (24 * HOUR);
    const atrophy =
      daysSince === null
        ? 0
        : Math.round(Math.min(100, Math.max(0, ((daysSince - 7) / 21) * 100)));

    return {
      muscle,
      label: MUSCLE_LABELS[muscle],
      recovery: Math.round((1 - fatigue) * 100),
      hoursLeft: Math.ceil(hoursLeft),
      daysSinceTrained: daysSince === null ? null : Math.floor(daysSince),
      atrophy,
    };
  });
}

// Recommend recovered muscles you've neglected longest, with exercises that
// only use fully recovered muscles
export function pickNext(
  statuses: MuscleStatus[],
  exercises: LoggedExercise[],
  count = 3
): Suggestion[] {
  const ready = statuses.filter((s) => s.recovery >= 90);
  const readySet = new Set<string>(ready.map((s) => s.muscle));

  return ready
    .sort((a, b) => (b.daysSinceTrained ?? 999) - (a.daysSinceTrained ?? 999))
    .slice(0, count)
    .map((s) => ({
      muscle: s.muscle,
      label: s.label,
      exercises: exercises
        .filter(
          (ex) =>
            ex.primary_muscles.includes(s.muscle) &&
            ex.primary_muscles.every((m) => readySet.has(m))
        )
        .slice(0, 2)
        .map((ex) => ex.name),
    }));
}