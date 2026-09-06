"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrFullscreen } from "./QrFullscreen";

/** QR ridisegnato dal codice: nitido, fondo bianco, correzione M. */
export function useQrImages(codes: string[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all(
      codes.map((c) =>
        QRCode.toDataURL(c, { margin: 2, errorCorrectionLevel: "M", width: 512 }).catch(
          () => "",
        ),
      ),
    ).then((list) => {
      if (alive) setUrls(list);
    });
    return () => {
      alive = false;
    };
  }, [codes]);
  return urls;
}

/**
 * I QR del biglietto (uno o più, in riga scorrevole) nel tagliando; il tocco apre
 * la vista a tutto schermo su fondo bianco, pronta per lo scanner in sala.
 */
export function TicketQr({
  codes,
  originalUrl,
  size = 120,
}: {
  codes: string[];
  originalUrl: string | null;
  size?: number;
}) {
  const urls = useQrImages(codes);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  if (codes.length === 0) return null;

  return (
    <>
      <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1">
        {codes.map((code, i) => (
          <button
            key={code}
            type="button"
            onClick={() => {
              setIndex(i);
              setOpen(true);
            }}
            aria-label={`QR biglietto ${i + 1} di ${codes.length}, apri a tutto schermo`}
            className="shrink-0 rounded-[14px] bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            style={{ width: size, height: size }}
          >
            {urls[i] ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL generata in locale
              <img
                src={urls[i]}
                alt={`QR biglietto ${i + 1}`}
                width={size - 16}
                height={size - 16}
                className="block size-full"
              />
            ) : (
              <span className="block size-full rounded-md bg-black/5" />
            )}
          </button>
        ))}
      </div>
      <QrFullscreen
        open={open}
        onClose={() => setOpen(false)}
        codes={codes}
        urls={urls}
        initialIndex={index}
        originalUrl={originalUrl}
      />
    </>
  );
}
