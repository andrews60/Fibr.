import { Inter } from "next/font/google";
import ProfileForm from "@/components/profile/ProfileForm";
import Toaster from "@/components/Toaster";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "900"] });

export default function ProfilePage() {
  return (
    <div className={inter.className}>
      <ProfileForm />
      <Toaster />
    </div>
  );
}
