# ZAPP — FASE 2: CATALOGO E DISPONIBILITÀ

## Contesto
La Fase 1 è completata: auth, schema DB, client TMDB con cache, shell mobile-first, PWA. Leggi il README e `lib/tmdb`, `lib/config.ts`, `supabase/migrations/0001` prima di iniziare. Non modificare lo schema esistente; se serve una colonna, proponila e fermati.

Questa fase costruisce il catalogo navigabile: scheda titolo completa (film e serie con stagioni ed episodi), sezione "Dove guardarlo" con link diretto alla pagina del titolo sulla piattaforma, e la scoperta (trending, generi). Ancora nessuna azione utente sui titoli: quella è la Fase 3.

## Route
```
/title/movie/[id]                scheda film
/title/tv/[id]                   scheda serie
/title/tv/[id]/season/[n]        episodi della stagione
/discover                        trending, novità, per genere (sostituisce il placeholder della tab Cerca quando l'input è vuoto)
```
Tutte Server Components con streaming (`loading.tsx` + Suspense sui blocchi lenti). `generateMetadata` con titolo e poster per og:image.

## Scheda titolo
Ordine verticale, mobile:
1. Backdrop con gradiente verso il tema scuro, poster sovrapposto, titolo, anno, durata o "N stagioni · M episodi", generi come chip
2. **Dove guardarlo** (vedi sotto). Va sopra la trama: è il motivo per cui l'utente apre la scheda
3. Voto TMDB (scala 10, mostrato come numero con una stella, più `vote_count`); attribuzione TMDB in piccolo
4. Trama, con "leggi tutto" oltre 4 righe
5. Cast principale (primi 10, scroll orizzontale, foto TMDB `w185`)
6. Serie: lista stagioni con poster, numero episodi, anno; tap → `/season/[n]`
7. Trailer: se `videos` contiene un trailer YouTube ufficiale, bottone che apre YouTube (nessun embed, per GDPR)
8. Simili / consigliati (TMDB `recommendations`, scroll orizzontale di `PosterCard`)
9. Slot vuoto `<TitleActions />` e `<TitleReviews />`: componenti placeholder che ritornano `null`, usati dalle fasi 3 e 4

Pagina stagione: header con nome stagione, lista episodi con still `w300`, numero, titolo, durata, data, trama collassata. Slot `<EpisodeActions />` placeholder.

Espandi il client TMDB con `getMovieDetails(id)` e `getTvDetails(id)` che usano `append_to_response=credits,videos,recommendations,external_ids,watch/providers`. Rispetta la cache di 7 giorni già implementata.

## Dove guardarlo
Mostra solo i provider `flatrate` (abbonamento) di default; `rent`/`buy` sotto un "Altre opzioni" collassato. Ogni provider è un bottone con logo TMDB e nome; il tap apre il link diretto in nuova scheda (`rel="noopener"`), che su mobile apre l'app tramite universal link.

Se il titolo non è disponibile in Italia: stato vuoto "Non disponibile in streaming in Italia".

### Resolver dei link diretti
Implementa `lib/links/resolve.ts` con `resolveProviderLink(title, providerId): Promise<{url, source}>`. Cascata, ci si ferma al primo risultato:

1. **manual** — riga in `title_provider_links` con `source = 'manual'`. Mai sovrascritta dal resolver.
2. **wikidata** — se `titles.external_ids.wikidata_id` esiste e il provider ha `wikidataProperty` in `PROVIDERS`: chiama `https://www.wikidata.org/wiki/Special:EntityData/{QID}.json`, leggi `claims[property][0].mainsnak.datavalue.value`, costruisci l'URL con `titleUrl`. Header `User-Agent: Zapp/1.0 (contatto email)` come richiesto da Wikidata. Timeout 3s. Per le serie, l'ID Wikidata di TMDB punta alla serie, non alla stagione: usa quello.
3. **search** — `searchUrl` del provider con il titolo (`encodeURIComponent`). Non fallisce mai.

Il risultato va salvato in `title_provider_links` con `resolved_at`; i link `wikidata` e `search` si ricalcolano dopo 30 giorni, i `search` si ritentano anche a 7 giorni (nel frattempo Wikidata potrebbe essere stato aggiornato). Il resolver gira lato server nel render della scheda, in parallelo per tutti i provider (`Promise.all`), e non deve bloccare la pagina: il blocco "Dove guardarlo" va in Suspense con skeleton.

Nell'UI segnala visivamente la differenza: link diretto → bottone normale; link di ricerca → stessa riga con sottotitolo "Apre la ricerca su {provider}". L'utente deve sapere cosa aspettarsi al tap.

### Admin minimo per gli override manuali
Nessuna UI. Un file `scripts/set-link.ts` eseguibile con `pnpm tsx scripts/set-link.ts <media_type> <tmdb_id> <provider_id> <url>` che usa la service role e fa upsert con `source = 'manual'`. Documentalo nel README.

## Discover
- Sezioni orizzontali: "Di tendenza questa settimana" (`trending/all/week`), "Nuovi su streaming" (`discover/movie` e `discover/tv` con `with_watch_providers` dei provider principali IT, `watch_region=IT`, ordinati per data), "Per genere" (chip dei generi TMDB in italiano, tap → griglia filtrata)
- Cache: `revalidate = 3600` sulle sezioni, nessun upsert in `titles` per le liste (solo per i dettagli)
- La ricerca esistente resta: mostra Discover quando l'input è vuoto, risultati quando c'è testo

## Componenti da aggiungere
`TitleHeader`, `WhereToWatch`, `ProviderButton`, `CastRow`, `SeasonList`, `EpisodeRow`, `HorizontalShelf`, `GenreChips`. Tutti in `components/title/` o `components/discover/`. Nessuna libreria UI.

## Criteri di accettazione
1. `/title/tv/1399` (Il Trono di Spade) mostra header, "Dove guardarlo" con i provider IT, cast, 8 stagioni; `/season/1` mostra 10 episodi con still e trama
2. Su un titolo Netflix noto, il bottone Netflix apre `netflix.com/title/{id}` (source `wikidata`), non la ricerca
3. Su un titolo NOW il bottone apre la ricerca e l'UI lo dichiara
4. Dopo l'override via script, il bottone usa l'URL manuale e non viene sovrascritto da un secondo render
5. Seconda visita alla stessa scheda: zero chiamate a TMDB e a Wikidata (verifica dai log)
6. Titolo non disponibile in IT: stato vuoto corretto, nessun bottone
7. Discover carica in < 1.5s su 4G simulato; Lighthouse performance ≥ 85 sulla scheda titolo
8. `pnpm typecheck` e `pnpm lint` puliti

## Cosa NON fare
- Nessuna azione utente (voglio vedere, visto, voto, recensioni, amici)
- Nessuna chiamata a JustWatch o ad altre API non ufficiali
- Nessun embed YouTube o iframe di terze parti
- Non riprodurre contenuti, non aprire player in-app
- Non modificare le migration esistenti

Procedi per step con commit atomici. Se una proprietà Wikidata o un ID provider non è verificabile, lascia il fallback alla ricerca e segnalalo in un commento `// TODO(verify)`.
