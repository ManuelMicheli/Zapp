import { HomeTypeGate } from "@/components/home/HomeType";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { SAGAS } from "@/lib/sagas/catalog";
import { SagaCard } from "./SagaCard";

export function SagaShelf() {
  return (
    <HomeTypeGate type={["all", "movie"]}>
      <HorizontalShelf title="Saghe e universi" seeAllHref="/sagas">
        {SAGAS.map((saga) => (
          <SagaCard key={saga.slug} saga={saga} shelf />
        ))}
      </HorizontalShelf>
    </HomeTypeGate>
  );
}
