/**
 * L'origine da cui l'app parla al browser.
 *
 * Ogni redirect costruito con `new URL(percorso, request.url)` prende l'origine
 * dall'header `Host`, che **lo scrive chi chiama**: un `Host: evil.example`
 * trasforma il nostro redirect in un rimando a un sito di terzi, con il nostro
 * dominio nella barra solo fino al primo salto. `/auth/callback` lo evitava gia'
 * con una funzione locale; quando e' arrivata la seconda rotta che reindirizza
 * (`/share/recommendation/<token>`) la funzione e' diventata questa, condivisa,
 * invece di essere copiata — una copia sarebbe rimasta indietro alla prima
 * modifica.
 *
 * `NEXT_PUBLIC_APP_URL` e' la stessa variabile che gia' fissa la base dei link
 * nelle email e nello User-Agent verso MyMovies. Se manca o e' scritta male si
 * ripiega sull'origine della richiesta: meglio un redirect che funziona di una
 * pagina che non risponde, e in produzione quella variabile c'e'.
 */
export function appOrigin(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // configurazione sbagliata: si ripiega sull'origin della richiesta
    }
  }
  return new URL(requestUrl).origin;
}
