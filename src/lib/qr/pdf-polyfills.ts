// Ponti per Safari/iOS: pdf.js 6 usa tre cose che WebKit non ha ancora, e senza
// queste la lettura dei QR non parte proprio (2026-09-07, riprodotto con Playwright
// WebKit sul biglietto Notorious "Biglietti minecraft.pdf"):
//
// - `Map.prototype.getOrInsertComputed` (proposta "upsert"): usata da `page.render`
//   → `TypeError: ... getOrInsertComputed is not a function`, niente fotogramma,
//   niente QR.
// - `ReadableStream` asincrono iterabile (`for await ... of stream`): usato da
//   `page.getTextContent` → `undefined is not a function (near '...value of
//   readableStream...')`, niente testo, quindi niente posti né sala.
// - `Math.sumPrecise`: usata dal livello testo; solo un warning, ma tanto vale.
//
// Il risultato su iPhone era sempre "QR non riconosciuto: mostro l'immagine del
// biglietto", su qualunque biglietto. Su Chrome desktop non si vedeva nulla di
// strano perché quelle API ci sono già. Il `legacy` build di pdf.js non basta:
// inciampa sullo stesso `ReadableStream`.
//
// Tutto in `defineProperty` non enumerabile e solo se manca: quando WebKit le
// implementerà, questo file non farà più niente.

interface UpsertMap {
  getOrInsert?: unknown;
  getOrInsertComputed?: unknown;
}

function define(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

let installed = false;

/** Da chiamare una volta, nel browser, prima di importare `pdfjs-dist`. */
export function installPdfPolyfills(): void {
  if (installed || typeof globalThis === "undefined") return;
  installed = true;

  const mapProto = Map.prototype as unknown as UpsertMap;
  if (typeof mapProto.getOrInsertComputed !== "function") {
    define(
      Map.prototype,
      "getOrInsertComputed",
      function (
        this: Map<unknown, unknown>,
        key: unknown,
        compute: (key: unknown) => unknown,
      ) {
        if (!this.has(key)) this.set(key, compute(key));
        return this.get(key);
      },
    );
  }
  if (typeof mapProto.getOrInsert !== "function") {
    define(
      Map.prototype,
      "getOrInsert",
      function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
        if (!this.has(key)) this.set(key, value);
        return this.get(key);
      },
    );
  }

  const weakProto = WeakMap.prototype as unknown as UpsertMap;
  if (typeof weakProto.getOrInsertComputed !== "function") {
    define(
      WeakMap.prototype,
      "getOrInsertComputed",
      function (
        this: WeakMap<object, unknown>,
        key: object,
        compute: (key: object) => unknown,
      ) {
        if (!this.has(key)) this.set(key, compute(key));
        return this.get(key);
      },
    );
  }

  if (
    typeof ReadableStream !== "undefined" &&
    !(Symbol.asyncIterator in ReadableStream.prototype)
  ) {
    const values = function (
      this: ReadableStream<unknown>,
      { preventCancel = false }: { preventCancel?: boolean } = {},
    ) {
      const reader = this.getReader();
      return {
        next: () => reader.read(),
        async return(value?: unknown) {
          if (!preventCancel) await reader.cancel(value);
          reader.releaseLock();
          return { done: true as const, value };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    };
    define(ReadableStream.prototype, Symbol.asyncIterator, values);
    define(ReadableStream.prototype, "values", values);
  }

  const math = Math as unknown as { sumPrecise?: unknown };
  if (typeof math.sumPrecise !== "function") {
    define(Math, "sumPrecise", (values: Iterable<number>) => {
      let sum = 0;
      for (const value of values) sum += value;
      return sum;
    });
  }
}
