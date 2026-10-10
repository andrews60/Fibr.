"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // If already logged in, skip straight to the dashboard
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.push("/dashboard");
    });
  }, [router]);

  async function handleSignIn() {
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setMessage(error.message);
    else router.push("/dashboard");
  }

  async function handleSignUp() {
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) setMessage(error.message);
    else router.push("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-700 p-4">
      <div className="w-full max-w-sm bg-white text-gray-900 rounded-xl shadow p-6 space-y-4">
        <Image src="/fibr-logo-black.png" alt="Fibr Logo" width={128} height={128} className="mx-auto h-32 w-32 object-contain" priority/>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-lg p-2"
        />
        <input
          type="password"
          placeholder="Password (6+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded-lg p-2"
        />

        {message && <p className="text-red-600 text-sm">{message}</p>}

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full bg-sky-700 text-white rounded-lg p-2 font-semibold disabled:opacity-50"
        >
          Log in
        </button>
        <button
          onClick={handleSignUp}
          disabled={loading}
          className="w-full border border-sky-700 text-sky-700 rounded-lg p-2 font-semibold disabled:opacity-50"
        >
          Sign up
        </button>
      </div>
    </main>
  );
}