import { getListSuggestions } from "@/lib/lists/suggestions";
import { ListSuggestions } from "./ListSuggestions";

export async function ListSuggestionsSection({
  listId,
  shared,
}: {
  listId: string;
  shared: boolean;
}) {
  const result = await getListSuggestions(listId);
  const title = shared ? "Suggeriti per voi" : "Suggeriti per te";
  let description: string;

  if (result.error) {
    description = "I suggerimenti saranno disponibili appena il caricamento riesce.";
  } else if (!result.personalized) {
    description = shared
      ? "Selezione generale: i profili di gusto non sono ancora disponibili o la personalizzazione è disattivata."
      : "Selezione generale: il profilo di gusto non è ancora disponibile o la personalizzazione è disattivata.";
  } else if (result.mode === "shared") {
    description = `Scelti dai gusti di ${result.contributorCount} ${
      result.contributorCount === 1 ? "persona che può" : "persone che possono"
    } modificare la lista.`;
  } else {
    description = "Scelti in base ai tuoi gusti.";
  }

  return (
    <section aria-labelledby="list-suggestions-title">
      <div className="mb-5 max-w-2xl">
        <h2
          id="list-suggestions-title"
          className="text-[26px] font-bold leading-tight tracking-[-0.035em] sm:text-[30px]"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>
      <ListSuggestions listId={listId} result={result} />
    </section>
  );
}
