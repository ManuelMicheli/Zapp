import Image from "next/image";
import { chainFor } from "@/lib/cinema/chains";

/**
 * Il marchio della catena accanto al nome della sala: il logo **libero**, senza
 * tessera né riquadro attorno (scelta utente 2026-09-07). Un cinema indipendente
 * non ha marchio: il componente non rende nulla e il nome resta dov'era.
 *
 * `size` è l'altezza dello spazio riservato: 36 nelle card, 28 nelle righe fitte;
 * il marchio ci sta dentro centrato, così le righe restano allineate come prima.
 * Il logo è decorativo (`alt=""`): il nome del cinema è già scritto accanto.
 */
export function ChainBadge({
  cinemaName,
  size = 36,
  className = "",
}: {
  cinemaName: string;
  size?: number;
  className?: string;
}) {
  const chain = chainFor(cinemaName);
  if (!chain?.logo) return null;
  const { src, width, height } = chain.logo;
  const square = width === height;
  // senza riquadro il marchio può essere più grande: quadrato all'86%, scritta al 54%
  const markHeight = Math.round(size * (square ? 0.86 : 0.54));
  const markWidth = Math.round((width / height) * markHeight);

  return (
    <span
      title={chain.name}
      className={`flex shrink-0 items-center justify-center ${className}`}
      style={{ height: size, width: square ? size : undefined }}
    >
      <Image
        src={src}
        alt=""
        width={markWidth}
        height={markHeight}
        style={{ height: markHeight, width: markWidth }}
        className="object-contain"
      />
    </span>
  );
}
