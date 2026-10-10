"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Row = {
  user_id: string;
  username: string;
  workouts: number;
  volume: number;
  sets: number;
  active_days: number;
};

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
};

type Metric = "volume" | "workouts" | "sets" | "active_days";

const METRICS: { key: Metric; label: string; format: (n: number) => string }[] = [
  { key: "volume", label: "Volume", format: (n) => `${Math.round(n).toLocaleString()} lbs` },
  { key: "workouts", label: "Workouts", format: (n) => `${n}` },
  { key: "sets", label: "Sets", format: (n) => `${n}` },
  { key: "active_days", label: "Active days", format: (n) => `${n}/7` },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [metric, setMetric] = useState<Metric>("volume");
  const [friendName, setFriendName] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  async function loadAll(userId: string) {
    // Leaderboard totals (you + accepted friends)
    const { data: board } = await supabase.rpc("friend_leaderboard");
    setRows(
      ((board ?? []) as Row[]).map((r) => ({
        ...r,
        workouts: Number(r.workouts),
        volume: Number(r.volume),
        sets: Number(r.sets),
        active_days: Number(r.active_days),
      }))
    );

    // Friend requests and friends
    const { data: fs } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status");
    const list = (fs ?? []) as Friendship[];
    setFriendships(list);

    // Look up the usernames of everyone in those friendships
    const otherIds = list.map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id));
    if (otherIds.length > 0) {
      const { data: ps } = await supabase.from("profiles").select("id, username").in("id", otherIds);
      setNames(Object.fromEntries((ps ?? []).map((p) => [p.id, p.username ?? "unknown"])));
    }
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setMyId(data.user.id);
      await loadAll(data.user.id);
    }
    load();
  }, [router]);

  function otherId(f: Friendship) {
    return f.requester_id === myId ? f.addressee_id : f.requester_id;
  }

  async function sendRequest() {
    setMessage("");
    setNotice("");
    const name = friendName.trim();
    if (!name || !myId) return;

    const { data: target } = await supabase
      .from("profiles")
      .select("id, username")
      .ilike("username", name)
      .maybeSingle();

    if (!target) {
      setMessage(`No user called "${name}".`);
      return;
    }
    if (target.id === myId) {
      setMessage("That's you!");
      return;
    }

    const existing = friendships.find((f) => otherId(f) === target.id);
    if (existing) {
      if (existing.status === "accepted") setMessage("You're already friends.");
      else if (existing.addressee_id === myId) await acceptRequest(existing.id); // they asked you first
      else setMessage("Request already sent.");
      return;
    }

    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: myId, addressee_id: target.id });
    if (error) {
      setMessage(error.message);
    } else {
      setNotice(`Request sent to ${target.username}!`);
      setFriendName("");
      await loadAll(myId);
    }
  }

  async function acceptRequest(id: string) {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    if (error) setMessage(error.message);
    else {
      setNotice("Friend added!");
      if (myId) await loadAll(myId);
    }
  }

  async function removeFriendship(id: string, label: string) {
    if (!confirm(`${label}?`)) return;
    const { error } = await supabase.from("friendships").delete().eq("id", id);
    if (error) setMessage(error.message);
    else if (myId) await loadAll(myId);
  }

  const current = METRICS.find((m) => m.key === metric)!;
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric]);
  const myUsername = rows.find((r) => r.user_id === myId)?.username;
  const incoming = friendships.filter((f) => f.status === "pending" && f.addressee_id === myId);
  const outgoing = friendships.filter((f) => f.status === "pending" && f.requester_id === myId);
  const friends = friendships.filter((f) => f.status === "accepted");

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Leaderboard</h1>
          <Link href="/dashboard" className="text-sky-700 font-semibold">
            ← Dashboard
          </Link>
        </div>

        {/* Leaderboard */}
        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-sm text-gray-500 mb-3">You and your friends · last 7 days</p>

          <div className="flex flex-wrap gap-2 mb-4">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  metric === m.key ? "bg-sky-700 text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <ol className="space-y-2">
            {sorted.map((r, i) => (
              <li
                key={r.user_id}
                className={`flex items-center justify-between rounded-lg p-3 ${
                  r.user_id === myId ? "bg-sky-50 border border-sky-200" : "border"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 text-center font-bold">{MEDALS[i] ?? i + 1}</span>
                  <span className="font-semibold">
                    {r.username}
                    {r.user_id === myId && <span className="text-gray-500 font-normal"> (you)</span>}
                  </span>
                </span>
                <span className="font-semibold">{current.format(r[metric])}</span>
              </li>
            ))}
          </ol>

          {rows.length <= 1 && (
            <p className="mt-4 text-sm text-gray-600">Add friends below to start competing!</p>
          )}
        </div>

        {/* Add a friend */}
        <div className="bg-white rounded-xl shadow p-6 space-y-3">
          <h2 className="text-xl font-bold">Add a friend</h2>
          {myUsername && (
            <p className="text-sm text-gray-600">
              Your username is <span className="font-semibold">{myUsername}</span>. Share it with friends.
            </p>
          )}
          <div className="flex gap-2">
            <input
              placeholder="Friend's username"
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
              className="flex-1 border rounded-lg p-2"
            />
            <button onClick={sendRequest} className="bg-sky-700 text-white rounded-lg px-4 font-semibold">
              Add
            </button>
          </div>
          {message && <p className="text-red-600 text-sm">{message}</p>}
          {notice && <p className="text-green-700 text-sm">{notice}</p>}
        </div>

        {/* Requests waiting for you */}
        {incoming.length > 0 && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold mb-3">Friend requests</h2>
            <ul className="space-y-2">
              {incoming.map((f) => (
                <li key={f.id} className="flex items-center justify-between border rounded-lg p-3">
                  <span className="font-semibold">{names[otherId(f)] ?? "Someone"}</span>
                  <span className="flex gap-2">
                    <button
                      onClick={() => acceptRequest(f.id)}
                      className="bg-sky-700 text-white rounded-lg px-3 py-1 text-sm font-semibold"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => removeFriendship(f.id, "Decline this request")}
                      className="text-sm text-gray-500 hover:text-red-600"
                    >
                      Decline
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Friends and sent requests */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold mb-3">Friends</h2>
          {friends.length === 0 && outgoing.length === 0 ? (
            <p className="text-gray-600 text-sm">No friends yet.</p>
          ) : (
            <ul className="space-y-2">
              {friends.map((f) => (
                <li key={f.id} className="flex items-center justify-between border rounded-lg p-3">
                  <span className="font-semibold">{names[otherId(f)] ?? "Friend"}</span>
                  <button
                    onClick={() => removeFriendship(f.id, "Remove this friend")}
                    className="text-sm text-gray-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {outgoing.map((f) => (
                <li key={f.id} className="flex items-center justify-between border border-dashed rounded-lg p-3">
                  <span>
                    {names[otherId(f)] ?? "Someone"} <span className="text-gray-500 text-sm">(pending)</span>
                  </span>
                  <button
                    onClick={() => removeFriendship(f.id, "Cancel this request")}
                    className="text-sm text-gray-400 hover:text-red-600"
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}