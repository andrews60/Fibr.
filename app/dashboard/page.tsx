"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Kick out anyone who isn't logged in
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setEmail(data.user.email ?? null);

      // Read this user's profile from the database
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .single();
      setUsername(profile?.username ?? null);
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
      <button
        onClick={handleSignOut}
        className="mt-6 bg-gray-800 text-white rounded-lg px-4 py-2"
      >
        Sign out
      </button>
    </main>
  );
}