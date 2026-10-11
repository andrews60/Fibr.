import { Inter } from "next/font/google";
import Dashboard from "@/components/dashboard/Dashboard";
import Toaster from "@/components/Toaster";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "900"] });

export default function DashboardPage() {
  return (
    <div className={inter.className}>
      <Dashboard />
      <Toaster />
    </div>
  );
}
