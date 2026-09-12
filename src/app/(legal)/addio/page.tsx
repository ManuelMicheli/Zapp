import Link from "next/link";

export const metadata = { title: "Account eliminato" };

/**
 * Dove si atterra dopo la cancellazione.
 *
 * Pubblica di proposito: chi arriva qui non ha più un account, e senza questa
 * pagina il `signOut` lo scaricherebbe su `/login` senza dirgli se l'eliminazione
 * è andata a buon fine.
 */
export default function AddioPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[520px] flex-col justify-center px-5 pb-16 text-center">
      <h1 className="text-[26px] font-semibold leading-tight text-text">
        Il tuo account è stato eliminato
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Abbiamo cancellato il profilo, la libreria e tutto quello che avevi salvato.
        Grazie per aver usato Zapp.
      </p>
      <Link
        href="/signup"
        prefetch={false}
        className="mt-8 inline-flex h-[54px] items-center justify-center rounded-full px-6 text-[17px] font-semibold text-accent-soft"
      >
        Ricomincia da capo
      </Link>
    </main>
  );
}
