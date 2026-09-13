"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { postToNative } from "@/lib/native/bridge";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // il guscio nativo dimentica il token del dispositivo: chi esce qui non
    // deve restare abbinato dall'altra parte del ponte
    postToNative({ type: "signedOut" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="w-full py-4 text-left text-[15px] font-semibold text-danger transition-opacity active:opacity-60"
    >
      Esci
    </button>
  );
}
