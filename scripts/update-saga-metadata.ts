/** Aggiorna solo dati di sistema; nessuna lettura o scrittura dei dati utente.
 * node --conditions=react-server --import tsx --env-file=.env.local scripts/update-saga-metadata.ts
 */
import { writeFile } from "node:fs/promises";
import { SAGA_DEFINITIONS } from "../src/lib/sagas/definitions";
import { getSagaMovieMetadata } from "../src/lib/tmdb/client";

async function main() {
  const ids = [...new Set(SAGA_DEFINITIONS.flatMap((saga) => saga.movieIds))];
  const movies = [];
  // Tre richieste contemporanee, oltre al limite 15/s del client condiviso.
  for (let i = 0; i < ids.length; i += 3) {
    movies.push(...(await Promise.all(ids.slice(i, i + 3).map(getSagaMovieMetadata))));
  }
  if (movies.some((movie) => !movie.title || !movie.releaseDate)) {
    throw new Error("Metadati incompleti: snapshot precedente conservato");
  }
  await writeFile(
    new URL("../src/lib/sagas/movies.json", import.meta.url),
    JSON.stringify(movies, null, 2) + "\n",
  );
  console.log(`${movies.length} film aggiornati`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
