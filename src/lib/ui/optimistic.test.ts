import { describe, expect, it, vi } from "vitest";
import {
  mergePages,
  sameServerValue,
  withAppended,
  withoutKey,
  withReplaced,
} from "./optimistic";

// Mock useToast per evitare che vitest provi a parsare il JSX di Toaster.tsx
// in ambiente node (dove jsx: "preserve" in tsconfig non è supportato).
// Questo test importa optimistic.ts che a sua volta importa Toaster.tsx;
// il mock interviene prima che nessun modulo sia caricato.
vi.mock("@/components/ui/Toaster", () => ({
  useToast: () => ({
    show: vi.fn(),
  }),
}));

interface Row {
  id: string;
  name: string;
}

const key = (r: Row) => r.id;
const rows: Row[] = [
  { id: "a", name: "Alfa" },
  { id: "b", name: "Bravo" },
];

describe("withoutKey", () => {
  it("toglie la riga con quella chiave", () => {
    expect(withoutKey(rows, key, "a")).toEqual([{ id: "b", name: "Bravo" }]);
  });

  it("lascia la lista com'è se la chiave non c'è", () => {
    expect(withoutKey(rows, key, "z")).toEqual(rows);
  });
});

describe("withReplaced", () => {
  it("sostituisce al suo posto", () => {
    expect(withReplaced(rows, key, { id: "a", name: "Altro" })).toEqual([
      { id: "a", name: "Altro" },
      { id: "b", name: "Bravo" },
    ]);
  });

  it("non aggiunge niente se la chiave non c'è", () => {
    expect(withReplaced(rows, key, { id: "z", name: "Zeta" })).toEqual(rows);
  });
});

describe("withAppended", () => {
  it("aggiunge in fondo", () => {
    expect(withAppended(rows, key, { id: "c", name: "Charlie" })).toHaveLength(3);
  });

  it("non duplica una chiave già presente", () => {
    expect(withAppended(rows, key, { id: "a", name: "Alfa" })).toEqual(rows);
  });
});

describe("sameServerValue", () => {
  it("due primitivi uguali sono lo stesso valore", () => {
    expect(sameServerValue(1, 1)).toBe(true);
    expect(sameServerValue("a", "a")).toBe(true);
  });

  it("due primitivi diversi non sono lo stesso valore", () => {
    expect(sameServerValue(1, 2)).toBe(false);
    expect(sameServerValue("a", "b")).toBe(false);
  });

  it("due oggetti diversi per riferimento ma uguali per contenuto sono lo stesso valore", () => {
    expect(sameServerValue({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
  });

  it("due array diversi per riferimento ma uguali per contenuto sono lo stesso valore", () => {
    expect(sameServerValue([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("due oggetti che differiscono nel contenuto non sono lo stesso valore", () => {
    expect(sameServerValue({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("una struttura circolare non fa esplodere il confronto, ritorna false", () => {
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;
    const b: Record<string, unknown> = { x: 1 };
    b.self = b;
    expect(sameServerValue(a, b)).toBe(false);
  });
});

describe("mergePages", () => {
  it("tiene le righe del server davanti e scarta i doppioni", () => {
    const more: Row[] = [
      { id: "b", name: "Bravo" },
      { id: "c", name: "Charlie" },
    ];
    expect(mergePages(rows, more, key)).toEqual([
      { id: "a", name: "Alfa" },
      { id: "b", name: "Bravo" },
      { id: "c", name: "Charlie" },
    ]);
  });

  it("una riga sparita dal server sparisce anche dalle pagine dopo", () => {
    const server: Row[] = [{ id: "b", name: "Bravo" }];
    const more: Row[] = [{ id: "c", name: "Charlie" }];
    expect(mergePages(server, more, key).map(key)).toEqual(["b", "c"]);
  });
});
