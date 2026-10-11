import { Inter } from "next/font/google";
import LogWorkout from "@/components/log/LogWorkout";
import Toaster from "@/components/Toaster";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "900"] });

export default function LogPage() {
  return (
    <div className={inter.className}>
      <LogWorkout />
      <Toaster />
    </div>
  );
}
