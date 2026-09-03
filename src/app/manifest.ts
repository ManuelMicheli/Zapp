import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zapp",
    short_name: "Zapp",
    description:
      "Traccia film e serie TV su tutte le piattaforme streaming. Scopri dove guardare ogni titolo in Italia.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b10",
    theme_color: "#0b0b10",
    lang: "it",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
