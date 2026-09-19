import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { ShortActions } from "@/components/shorts/ShortActions";
import { ShortCard } from "@/components/shorts/ShortCard";
import { ShortPlayer } from "@/components/shorts/ShortPlayer";
import { getViewer } from "@/lib/auth/viewer";
import {
  durataLabel,
  linguaLabel,
  shortBySlug,
  shortsSimili,
  visualizzazioniLabel,
} from "@/lib/shorts/catalog";
import { getStatoCorti } from "@/lib/shorts/queries";

type Params = { params: Promise<{ slug: string }> };

/**
 * Niente `generateStaticParams`: la pagina legge lo stato dell'utente (visto,
 * preferito) e quindi i cookie, il che la rende dinamica comunque — prerenderne
 * cento copie che poi nessuno serve sarebbe solo tempo di build. Il catalogo resta
 * un file, quindi il costo per richiesta e' una query sola, e per un ospite zero.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const corto = shortBySlug(slug);
  if (!corto) return { title: "Cortometraggio" };
  return {
    title: corto.titolo,
    description: corto.trama,
    openGraph: {
      title: `${corto.titolo} · Corti`,
      description: corto.trama,
      images: [`https://i.ytimg.com/vi/${corto.youtubeId}/hqdefault.jpg`],
    },
  };
}

export default async function CortoPage({ params }: Params) {
  const { slug } = await params;
  const corto = shortBySlug(slug);
  if (!corto) notFound();

  const [viewer, stato] = await Promise.all([getViewer(), getStatoCorti()]);
  const mio = stato.get(corto.youtubeId);
  const simili = shortsSimili(corto);

  return (
    <>
      <TopBar title={corto.titolo} back parent={{ label: "Corti", href: "/corti" }} />
      <main className="pb-16">
        {/* Sotto lg il player resta appiccicato in alto mentre si scorre la trama:
            e' il motivo per cui si sta su questa pagina. Da lg non serve — il testo
            gli sta di fianco e il video non esce mai dallo schermo. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10 lg:px-10">
          <div className="sticky top-0 z-20 -mt-2 lg:static lg:mt-0">
            <ShortPlayer
              corto={corto}
              autenticato={Boolean(viewer)}
              giaVisto={Boolean(mio?.vistoIl)}
            />
          </div>

          <div className="px-5 pt-5 lg:px-0 lg:pt-0">
            <h1 className="text-balance text-[28px] font-bold leading-[1.05] tracking-[-0.04em] lg:text-[34px]">
              {corto.titolo}
            </h1>

            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-muted">
              <span className="text-accent-soft">{corto.genere}</span>
              <span aria-hidden="true">·</span>
              <span>{durataLabel(corto.durata)}</span>
              <span aria-hidden="true">·</span>
              <span>{corto.anno}</span>
              <span aria-hidden="true">·</span>
              <span>{linguaLabel(corto)}</span>
            </p>

            {corto.riconoscimento && (
              <p className="glass-accent mt-3.5 w-fit rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white">
                {corto.riconoscimento}
              </p>
            )}

            <p className="mt-4 text-pretty text-[15px] leading-relaxed text-white/80 lg:text-[16px]">
              {corto.trama}
            </p>

            <div className="mt-5">
              <ShortActions
                corto={corto}
                visto={Boolean(mio?.vistoIl)}
                preferito={Boolean(mio?.preferito)}
                autenticato={Boolean(viewer)}
              />
            </div>

            {!viewer && (
              <p className="mt-3 text-[13px] text-muted">
                Il corto si guarda anche senza account. Per tenerne traccia serve
                accedere.
              </p>
            )}

            <dl className="mt-7 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-5 text-[13px]">
              <div>
                <dt className="text-muted-2">Canale</dt>
                <dd className="mt-0.5 truncate font-medium">{corto.canale}</dd>
              </div>
              <div>
                <dt className="text-muted-2">Visualizzazioni</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {visualizzazioniLabel(corto.visualizzazioni)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-10">
          <HorizontalShelf title="Altri corti" seeAllHref="/corti">
            {simili.map((altro) => (
              <ShortCard
                key={altro.slug}
                corto={altro}
                shelf
                visto={Boolean(stato.get(altro.youtubeId)?.vistoIl)}
                preferito={Boolean(stato.get(altro.youtubeId)?.preferito)}
              />
            ))}
          </HorizontalShelf>
        </div>
      </main>
    </>
  );
}
