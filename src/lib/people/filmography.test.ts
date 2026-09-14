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
    vote_count: 500,
    popularity: 10,
    genre_ids: [18],
    character: "Un personaggio",
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
    vote_count: 300,
    popularity: 5,
    genre_ids: [18],
    character: "Un personaggio",
    episode_count: 20,
    ...patch,
  };
}

const vuoto = { cast: [], crew: [] };

function soloFilm(cast: unknown[]) {
  return filmografia(
    { cast } as unknown as TmdbPersonMovieCredits,
    vuoto as unknown as TmdbPersonTvCredits,
  );
}

function soloSerie(cast: unknown[]) {
  return filmografia(
    vuoto as unknown as TmdbPersonMovieCredits,
    { cast } as unknown as TmdbPersonTvCredits,
  );
}

describe("filmografia", () => {
  it("mappa un film del cast con anno e locandina", () => {
    const out = soloFilm([film({ id: 42 })]);
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
    const out = soloFilm([film({ id: 1, poster_path: null }), film({ id: 2 })]);
    expect(out.interprete.map((c) => c.id)).toEqual([2]);
  });

  it("ordina per numero di voti: e' la fama, non la moda di questa settimana", () => {
    // Il caso vero: un'ospitata in un talk show ha popolarita' altissima e quattro
    // voti, un classico ha popolarita' bassa e ventimila voti. Prima vinceva il talk.
    const out = filmografia(
      {
        cast: [
          film({ id: 1, vote_count: 20000, popularity: 30 }),
          film({ id: 2, vote_count: 3000, popularity: 12 }),
        ],
      } as unknown as TmdbPersonMovieCredits,
      {
        cast: [serie({ id: 3, vote_count: 200, popularity: 250 })],
      } as unknown as TmdbPersonTvCredits,
    );
    // Il talk (3) sta in fondo pur avendo la popolarita' piu' alta di tutti.
    expect(out.interprete.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("una novita' senza voti ma molto popolare non finisce in fondo", () => {
    const out = soloFilm([
      film({ id: 1, vote_count: 400, popularity: 3 }),
      film({ id: 2, vote_count: 0, popularity: 500 }),
    ]);
    expect(out.interprete.map((c) => c.id)).toEqual([2, 1]);
  });

  it("a pari notorieta' l'ordine e' stabile fra due render", () => {
    const uguali = [film({ id: 9 }), film({ id: 3 }), film({ id: 5 })];
    expect(soloFilm(uguali).interprete.map((c) => c.id)).toEqual([3, 5, 9]);
  });

  it("scarta le ospitate: chi si fa intervistare non ha recitato", () => {
    const out = soloSerie([
      serie({ id: 1, character: "Self - Guest" }),
      serie({ id: 2, character: "Self" }),
      // Refuso vero di TMDB su un credito di Christopher Nolan.
      serie({ id: 3, character: "Selft" }),
      serie({ id: 4, character: "Himself" }),
      serie({ id: 5, character: "Se stesso" }),
      serie({ id: 6, character: "Un personaggio (uncredited)" }),
      serie({ id: 7, character: "Un personaggio (archive footage)" }),
      serie({ id: 8 }),
    ]);
    expect(out.interprete.map((c) => c.id)).toEqual([8]);
  });

  it("scarta talk show, notiziari e reality: non sono titoli che si guardano", () => {
    const out = soloSerie([
      serie({ id: 1, genre_ids: [35, 10767] }),
      serie({ id: 2, genre_ids: [10763] }),
      serie({ id: 3, genre_ids: [10764, 10751] }),
      serie({ id: 4, genre_ids: [18] }),
    ]);
    expect(out.interprete.map((c) => c.id)).toEqual([4]);
  });

  it("scarta la comparsa da un episodio, tiene chi la serie l'ha fatta", () => {
    const out = soloSerie([serie({ id: 1, episode_count: 1 }), serie({ id: 2 })]);
    expect(out.interprete.map((c) => c.id)).toEqual([2]);
  });

  it("il documentario esce dal cast ma resta nella regia", () => {
    const out = filmografia(
      {
        cast: [film({ id: 1, genre_ids: [99] }), film({ id: 2 })],
        crew: [film({ id: 3, genre_ids: [99], job: "Director" })],
      } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete.map((c) => c.id)).toEqual([2]);
    expect(out.regista.map((c) => c.id)).toEqual([3]);
  });

  it("scarta gli extra: nessun voto e nessuno che li guardi", () => {
    const out = soloFilm([
      film({ id: 1, vote_count: 0, popularity: 1 }),
      film({ id: 2, vote_count: 3, popularity: 1 }),
    ]);
    expect(out.interprete.map((c) => c.id)).toEqual([2]);
  });

  it("scarta il porno", () => {
    const out = soloFilm([film({ id: 1, adult: true }), film({ id: 2 })]);
    expect(out.interprete.map((c) => c.id)).toEqual([2]);
  });

  it("non ripete lo stesso titolo accreditato due volte", () => {
    // Due righe per lo stesso show, una per personaggio: TMDB le manda davvero cosi'.
    const out = soloFilm([film({ id: 5 }), film({ id: 5, character: "Un altro" })]);
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
      film({ id: i + 1, vote_count: i + 1 }),
    );
    const out = soloFilm(molti);
    expect(out.interprete).toHaveLength(MAX_CREDITI);

    // La sola lunghezza non basta: un taglio prematuro (prima dell'ordinamento)
    // avrebbe tenuto i film 1-60 con i voti piu' bassi, prodotto comunque 60 elementi,
    // e il test passerebbe. Verifichiamo che il taglio avvenga DOPO l'ordinamento
    // controllando che restino i piu' noti (id alti) e spariscano i 10 meno noti.
    expect(out.interprete[0].id).toBe(70);

    const idPresenti = new Set(out.interprete.map((c) => c.id));
    for (let i = 1; i <= 10; i++) {
      expect(idPresenti.has(i)).toBe(false);
    }
  });

  it("un voto a zero e' un voto che non c'e'", () => {
    const out = soloFilm([film({ vote_average: 0 })]);
    expect(out.interprete[0].voteAverage).toBeNull();
  });

  it("regge risposte assenti", () => {
    expect(filmografia(null, null)).toEqual({ interprete: [], regista: [] });
  });
});
