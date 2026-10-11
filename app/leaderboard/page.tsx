import { Inter } from "next/font/google";
import Leaderboard from "@/components/leaderboard/Leaderboard";
import Toaster from "@/components/Toaster";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "900"] });

export default function LeaderboardPage() {
  return (
    <div className={inter.className}>
      <Leaderboard />
      <Toaster />
    </div>
  );
}
