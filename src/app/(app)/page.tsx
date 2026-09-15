import { Home } from "@/components/home/HomePage";

/**
 * La home intera. La stessa pagina filtrata per genere e/o piattaforma sta in
 * `/home/[...filtri]`; il componente è uno solo (`src/components/home/HomePage.tsx`).
 */
export default function HomePage() {
  return <Home />;
}
