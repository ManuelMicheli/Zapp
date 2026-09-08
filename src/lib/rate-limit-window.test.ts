import { describe, expect, it } from "vitest";
import { consenti, spazza, type Finestra } from "./rate-limit-window";

describe("consenti", () => {
  it("lascia passare fino al limite e poi no", () => {
    const f: Finestra = { timestamps: [] };
    expect(consenti(f, 1000, 2, 60)).toBe(true);
    expect(consenti(f, 1001, 2, 60)).toBe(true);
    expect(consenti(f, 1002, 2, 60)).toBe(false);
  });

  it("riapre quando la finestra e' scorsa", () => {
    const f: Finestra = { timestamps: [] };
    consenti(f, 1000, 1, 60);
    expect(consenti(f, 1000 + 59_000, 1, 60)).toBe(false);
    expect(consenti(f, 1000 + 61_000, 1, 60)).toBe(true);
  });

  it("non accumula i respinti", () => {
    // Se un tentativo respinto entrasse nella finestra, chi insiste si
    // allungherebbe da solo la punizione oltre la finestra dichiarata.
    const f: Finestra = { timestamps: [] };
    consenti(f, 1000, 1, 60);
    consenti(f, 1001, 1, 60);
    consenti(f, 1002, 1, 60);
    expect(f.timestamps).toHaveLength(1);
  });

  it("con limite zero non passa niente", () => {
    const f: Finestra = { timestamps: [] };
    expect(consenti(f, 1000, 0, 60)).toBe(false);
  });
});

describe("spazza", () => {
  it("toglie solo le finestre esaurite", () => {
    const m = new Map<string, Finestra>([
      ["vecchia", { timestamps: [1000] }],
      ["viva", { timestamps: [100_000] }],
    ]);
    expect(spazza(m, 130_000, 60, 1000)).toBe(1);
    expect([...m.keys()]).toEqual(["viva"]);
  });

  it("toglie anche le finestre vuote", () => {
    const m = new Map<string, Finestra>([["vuota", { timestamps: [] }]]);
    expect(spazza(m, 1000, 60, 1000)).toBe(1);
    expect(m.size).toBe(0);
  });

  it("svuota tutto se le chiavi sono troppe", () => {
    // Perdere lo stato del limitatore vale molto meno che tenere in piedi
    // il processo.
    const m = new Map<string, Finestra>();
    for (let i = 0; i < 10; i += 1) m.set(String(i), { timestamps: [100_000] });
    spazza(m, 100_001, 60, 5);
    expect(m.size).toBe(0);
  });
});
