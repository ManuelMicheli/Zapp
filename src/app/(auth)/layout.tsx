import { AuthShell } from "@/components/auth/AuthShell";
import { getWallPosters } from "@/lib/tmdb/wall";

/** Layout auth (login/signup): vedi `AuthShell` per il guscio 75/25. */
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const posters = await getWallPosters();
  return <AuthShell posters={posters}>{children}</AuthShell>;
}
