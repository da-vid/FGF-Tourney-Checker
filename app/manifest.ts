import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FGF Tourney Tracker",
    short_name: "FGF Tourneys",
    description: "Daily NorCal 12U tournament fields and registration monitoring.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1e9",
    theme_color: "#071822",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
