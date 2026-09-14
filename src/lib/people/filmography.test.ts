import { describe, expect, it } from "vitest";
import { filmografia, MAX_CREDITI } from "./filmography";
import type { TmdbPersonMovieCredits, TmdbPersonTvCredits } from "@/lib/tmdb/types";

function film(patch: Record<string, unknown>) {
  return {
    id: 1,
    media_type: "movie",
    title: "Un film",
    poster_path: "/p.jpg",
    release_date: "2020-05-01",
    vote_average: 7,
    popularity: 10,
    ...patch,
  };
}

function serie(patch: Record<string, unknown>) {
  return {
    id: 1,
    media_type: "tv",
    name: "Una serie",
    poster_path: "/s.jpg",
    first_air_date: "2019-01-01",
    vote_average: 8,
    popularity: 5,
    ...patch,
  };
}

const vuoto = { cast: [], crew: [] };

describe("filmografia", () => {
  it("mappa un film del cast con anno e locandina", () => {
    const out = filmografia(
      { cast: [film({ id: 42 })] } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete).toEqual([
      {
        id: 42,
        mediaType: "movie",
        title: "Un film",
        posterPath: "/p.jpg",
        year: "2020",
        voteAverage: 7,
      },
    ]);
    expect(out.regista).toEqual([]);
  });

  it("scarta i crediti senza locandina: sono comparsate ed errori di TMDB", () => {
    const out = filmografia(
      {
        cast: [film({ id: 1, poster_path: null }), film({ id: 2 })],
      } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete.map((c) => c.id)).toEqual([2]);
  });

  it("ordina per popolarita' decrescente, film e serie insieme", () => {
    const out = filmografia(
      {
        cast: [film({ id: 1, popularity: 3 }), film({ id: 2, popularity: 50 })],
      } as unknown as TmdbPersonMovieCredits,
      { cast: [serie({ id: 3, popularity: 20 })] } as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete.map((c) => c.id)).toEqual([2, 3, 1]);
  });

  it("non ripete lo stesso titolo accreditato due volte", () => {
    const out = filmografia(
      {
        cast: [film({ id: 5 }), film({ id: 5 })],
      } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete).toHaveLength(1);
  });

  it("lo stesso id fra un film e una serie sono due titoli diversi", () => {
    const out = filmografia(
      { cast: [film({ id: 9 })] } as unknown as TmdbPersonMovieCredits,
      { cast: [serie({ id: 9 })] } as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete).toHaveLength(2);
  });

  it("in regia va solo chi ha job Director, non tutta la troupe", () => {
    const out = filmografia(
      {
        crew: [
          film({ id: 1, job: "Director" }),
          film({ id: 2, job: "Executive Producer" }),
        ],
      } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.regista.map((c) => c.id)).toEqual([1]);
  });

  it("taglia a MAX_CREDITI per sezione", () => {
    const molti = Array.from({ length: MAX_CREDITI + 10 }, (_, i) =>
      film({ id: i + 1, popularity: i }),
    );
    const out = filmografia(
      { cast: molti } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete).toHaveLength(MAX_CREDITI);

    // La sola lunghezza non basta: un taglio prematuro (prima dell'ordinamento)
    // avrebbe tenuto i film 1-60 con popolarità 0-59, prodotto comunque 60 elementi,
    // e il test passerebbe. Verifichiamo che il taglio avvenga DOPO l'ordinamento
    // controllando che restino i film piu' popolari (id alti) e spariscano i 10 meno
    // popolari (id bassi).
    const primoElemento = out.interprete[0];
    expect(primoElemento.id).toBe(70); // il film con popolarità massima (69)

    const idPresenti = new Set(out.interprete.map((c) => c.id));
    // Gli id 1-10 (film meno popolari, scartati dal taglio) non devono essere presenti
    for (let i = 1; i <= 10; i++) {
      expect(idPresenti.has(i)).toBe(false);
    }
  });

  it("un voto a zero e' un voto che non c'e'", () => {
    const out = filmografia(
      { cast: [film({ vote_average: 0 })] } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete[0].voteAverage).toBeNull();
  });

  it("regge risposte assenti", () => {
    expect(filmografia(null, null)).toEqual({ interprete: [], regista: [] });
  });
});
