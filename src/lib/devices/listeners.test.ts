import { describe, expect, it } from "vitest";
import {
  ASCOLTATORI,
  comandi,
  componiElenco,
  eIndirizzoPrivato,
  normalizzaIp,
} from "./listeners";

const ZAPP = ASCOLTATORI["zapp-tv"].componente;
const ZC = ASCOLTATORI.zconnection.componente;
const ALTRA = "com.altra.app/com.altra.app.Listener";

describe("componiElenco", () => {
  it("con l'elenco vuoto mette solo il nostro servizio", () => {
    expect(componiElenco("", ZAPP)).toBe(ZAPP);
    expect(componiElenco("   ", ZAPP)).toBe(ZAPP);
  });

  it("tratta il 'null' di adb come elenco vuoto", () => {
    expect(componiElenco("null", ZAPP)).toBe(ZAPP);
    expect(componiElenco(" NULL\r\n", ZAPP)).toBe(ZAPP);
  });

  it("accoda in fondo senza toccare gli altri ascoltatori", () => {
    expect(componiElenco(ALTRA, ZAPP)).toBe(`${ALTRA}:${ZAPP}`);
  });

  it("non aggiunge due volte lo stesso servizio", () => {
    expect(componiElenco(`${ALTRA}:${ZAPP}`, ZAPP)).toBe(`${ALTRA}:${ZAPP}`);
  });

  it("riconosce la forma corta con il punto davanti alla classe", () => {
    expect(componiElenco("com.zapp.tv/.ascolto.ZListener", ZAPP)).toBe(
      "com.zapp.tv/.ascolto.ZListener",
    );
  });

  it("non confonde due app diverse", () => {
    expect(componiElenco(ZC, ZAPP)).toBe(`${ZC}:${ZAPP}`);
  });

  it("ripulisce separatori doppi, spazi e virgolette del terminale", () => {
    expect(componiElenco(`"${ALTRA}::"`, ZAPP)).toBe(`${ALTRA}:${ZAPP}`);
    expect(componiElenco(` ${ALTRA} : `, ZAPP)).toBe(`${ALTRA}:${ZAPP}`);
  });
});

describe("normalizzaIp", () => {
  it("accetta un IPv4 valido", () => {
    expect(normalizzaIp(" 192.168.1.221 ")).toBe("192.168.1.221");
    expect(normalizzaIp("10.0.0.5")).toBe("10.0.0.5");
  });

  it("rifiuta quello che non e' un IPv4", () => {
    expect(normalizzaIp("192.168.1")).toBeNull();
    expect(normalizzaIp("192.168.1.256")).toBeNull();
    expect(normalizzaIp("192.168.1.221:5555")).toBeNull();
    expect(normalizzaIp("casa")).toBeNull();
    expect(normalizzaIp("")).toBeNull();
  });
});

describe("eIndirizzoPrivato", () => {
  it("riconosce le reti di casa", () => {
    expect(eIndirizzoPrivato("192.168.1.221")).toBe(true);
    expect(eIndirizzoPrivato("10.1.2.3")).toBe(true);
    expect(eIndirizzoPrivato("172.16.0.1")).toBe(true);
    expect(eIndirizzoPrivato("172.31.255.254")).toBe(true);
  });

  it("scarta quello che non e' una rete locale", () => {
    expect(eIndirizzoPrivato("172.32.0.1")).toBe(false);
    expect(eIndirizzoPrivato("8.8.8.8")).toBe(false);
  });
});

describe("comandi", () => {
  const passi = comandi("windows", "192.168.1.221", ZAPP, ALTRA);

  it("su Windows chiama adb dalla cartella corrente", () => {
    expect(passi.connetti).toBe(".\\adb connect 192.168.1.221:5555");
  });

  it("su Mac e Linux usa ./adb", () => {
    expect(comandi("unix", "10.0.0.5", ZAPP, "").connetti).toBe(
      "./adb connect 10.0.0.5:5555",
    );
  });

  it("legge l'elenco prima di scriverlo", () => {
    expect(passi.leggi).toContain("settings get secure enabled_notification_listeners");
    expect(passi.leggi).not.toContain("put");
  });

  it("scrive l'elenco accodato, fra virgolette", () => {
    expect(passi.scrivi).toBe(
      `.\\adb -s 192.168.1.221:5555 shell settings put secure enabled_notification_listeners "${ALTRA}:${ZAPP}"`,
    );
  });

  it("parla sempre con la TV indicata, mai con un altro dispositivo attaccato", () => {
    for (const passo of [passi.leggi, passi.scrivi, passi.verifica]) {
      expect(passo).toContain("-s 192.168.1.221:5555");
    }
  });
});
