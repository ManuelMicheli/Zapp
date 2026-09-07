import Image from "next/image";
import { chainFor } from "@/lib/cinema/chains";

/**
 * Il marchio della catena accanto al nome della sala: tessera in vetro col logo
 * (UCI, The Space, Cinelandia) o pillola con la scritta dove il marchio è solo
 * testo (Notorious). Un cinema indipendente non ha marchio: il componente non
 * rende nulla e il nome resta dov'era.
 *
 * `size` è l'altezza della tessera: 36 nelle card, 28 nelle righe fitte.
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
  // dentro la tessera il marchio respira: quadrato al 72%, scritta al 46%
  const markHeight = Math.round(size * (square ? 0.72 : 0.46));
  const markWidth = Math.round((width / height) * markHeight);

  return (
    <span
      title={chain.name}
      className={`glass flex shrink-0 items-center justify-center overflow-hidden rounded-[11px] ${className}`}
      style={{
        height: size,
        width: square ? size : undefined,
        paddingInline: square ? undefined : Math.round(size * 0.22),
      }}
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
