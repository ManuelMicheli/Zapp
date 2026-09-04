import { TopBar } from "@/components/layout/TopBar";
import { ImportClient } from "./ImportClient";

export const metadata = { title: "Importa da Netflix" };

export default function NetflixImportPage() {
  return (
    <>
      <TopBar title="Importa da Netflix" />
      <main className="px-4 pb-36 lg:px-6">
        <ImportClient />
      </main>
    </>
  );
}
