import { describe, expect, it } from "vitest";
import { ASCOLTATORI } from "./listeners";
import { nomeFile, scriptTv } from "./tv-script";

const IP = "192.168.1.221";
const ZAPP = ASCOLTATORI["zapp-tv"].componente;

describe("nomeFile", () => {
  it("da' un file che Windows apre col doppio clic", () => {
    expect(nomeFile("windows")).toBe("attiva-tracciamento-zapp.bat");
  });

  it("su Mac e Linux e' un .command", () => {
    expect(nomeFile("unix")).toBe("attiva-tracciamento-zapp.command");
  });
});

describe("scriptTv", () => {
  const windows = scriptTv("windows", IP, "zapp-tv");
  const unix = scriptTv("unix", IP, "zconnection");

  it("porta dentro l'indirizzo e il servizio giusto", () => {
    expect(windows).toContain(IP);
    expect(windows).toContain(ZAPP);
    expect(unix).toContain(ASCOLTATORI.zconnection.componente);
    expect(unix).not.toContain(ZAPP);
  });

  it("legge l'elenco prima di riscriverlo", () => {
    for (const testo of [windows, unix]) {
      const lettura = testo.indexOf("settings get secure");
      const scrittura = testo.indexOf("settings put secure");
      expect(lettura).toBeGreaterThan(-1);
      expect(scrittura).toBeGreaterThan(lettura);
    }
  });

  it("su Windows e' un .bat che si passa il resto del file a PowerShell", () => {
    expect(windows.startsWith("@echo off")).toBe(true);
    // Le righe di cmd si riconoscono dal marcatore e sono le uniche a portarlo:
    // e' cosi' che `findstr` le toglie e lascia solo PowerShell.
    const righe = windows.split("\r\n");
    const conMarcatore = righe.filter((riga) => riga.includes("ZAPPBAT"));
    expect(conMarcatore.length).toBeGreaterThanOrEqual(3);
    expect(righe.indexOf(conMarcatore[conMarcatore.length - 1])).toBeLessThan(10);
  });

  it("non lascia un '$variabile:' dentro il testo PowerShell", () => {
    // PowerShell legge `$app:` come variabile con qualificatore di drive e si
    // rifiuta di eseguire l'intero file: errore di sintassi, non di runtime.
    // Solo `$env:` e' legittimo. Visto davvero, col parser, il 19/09/2026.
    const sospetti = windows
      .split("\r\n")
      .flatMap((riga) => riga.match(/\$[A-Za-z_][A-Za-z0-9_]*:/g) ?? [])
      .filter((occorrenza) => occorrenza !== "$env:");
    expect(sospetti).toEqual([]);
  });

  it("su Windows scrive CRLF, se no cmd non legge il file", () => {
    expect(windows).toContain("\r\n");
    expect(windows.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("su Mac e Linux e' bash con LF e lo shebang", () => {
    expect(unix.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(unix).not.toContain("\r");
    expect(unix).toContain("platform-tools-latest-darwin.zip");
    expect(unix).toContain("platform-tools-latest-linux.zip");
  });

  it("prende adb dal sito ufficiale di Google", () => {
    expect(windows).toContain(
      "https://dl.google.com/android/repository/platform-tools-latest-windows.zip",
    );
  });

  it("rifiuta un indirizzo che non e' un IPv4", () => {
    // Il valore finisce dentro un file eseguibile: qui non si ripulisce, si
    // rifiuta. La pagina ha gia' validato, questo e' il secondo muro.
    expect(() => scriptTv("windows", "192.168.1.221; rm -rf /", "zapp-tv")).toThrow();
    expect(() => scriptTv("unix", "$(curl male.example)", "zapp-tv")).toThrow();
    expect(() => scriptTv("unix", "999.1.1.1", "zapp-tv")).toThrow();
  });
});
