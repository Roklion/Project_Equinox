import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Equinox",
    short_name: "Equinox",
    description: "A clear view of investment values, cash flows, and performance.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f3",
    theme_color: "#315d49",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
