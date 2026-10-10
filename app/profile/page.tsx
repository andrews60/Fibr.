"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const inputClass = "w-full border rounded-lg p-2";

export default function ProfilePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [experience, setExperience] = useState("beginner");
  const [goal, setGoal] = useState("build muscle");
  const [message, setMessage] = useState("");

  // Load the user's current profile so the form starts filled in
  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setUserId(data.user.id);

      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (p) {
        setUsername(p.username ?? "");
        if (p.height_in) {
          setFeet(String(Math.floor(p.height_in / 12)));
          setInches(String(p.height_in % 12));
        }
        setWeight(p.weight_lbs?.toString() ?? "");
        setAge(p.age?.toString() ?? "");
        setExperience(p.experience ?? "beginner");
        setGoal(p.goal ?? "build muscle");
      }
    }
    load();
  }, [router]);

  async function handleSave() {
    if (!userId) return;
    setMessage("");

    // Store height as total inches (5 ft 10 in = 70)
    const heightIn =
      feet || inches ? Number(feet || 0) * 12 + Number(inches || 0) : null;

    const { error } = await supabase
      .from("profiles")
      .update({
        username,
        height_in: heightIn,
        weight_lbs: weight ? Number(weight) : null,
        age: age ? Number(age) : null,
        experience,
        goal,
      })
      .eq("id", userId);

    if (error) setMessage(error.message);
    else router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900 p-4 flex justify-center">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold">Your profile</h1>

        <label className="block">
          <span className="text-sm font-semibold">Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
        </label>

        <div>
          <span className="text-sm font-semibold">Height</span>
          <div className="flex gap-2">
            <input type="number" placeholder="ft" value={feet} onChange={(e) => setFeet(e.target.value)} className={inputClass} />
            <input type="number" placeholder="in" value={inches} onChange={(e) => setInches(e.target.value)} className={inputClass} />
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold">Weight (lbs)</span>
          <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} />
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Age</span>
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} />
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Experience</span>
          <select value={experience} onChange={(e) => setExperience(e.target.value)} className={inputClass}>
            <option value="beginner">Beginner (under 1 year)</option>
            <option value="intermediate">Intermediate (1–3 years)</option>
            <option value="advanced">Advanced (3+ years)</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Goal</span>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className={inputClass}>
            <option value="build muscle">Build muscle</option>
            <option value="get stronger">Get stronger</option>
            <option value="lose fat">Lose fat</option>
            <option value="stay healthy">Stay healthy</option>
          </select>
        </label>

        {message && <p className="text-red-600 text-sm">{message}</p>}

        <button onClick={handleSave} className="w-full bg-blue-600 text-white rounded-lg p-2 font-semibold">
          Save
        </button>
      </div>
    </main>
  );
}