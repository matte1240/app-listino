import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Listino Materiali",
    short_name: "Listino",
    description: "Consulta e ordina materiali dal listino aziendale",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#005f93",
    theme_color: "#005f93",
    orientation: "portrait",
    lang: "it-IT",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
      },
      {
        src: "/icons/icon-1024-maskable.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
