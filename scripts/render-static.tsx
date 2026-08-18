import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardClient } from "../app/DashboardClient";
import { dashboardState } from "../app/page";
import { writeScoutExports } from "./scout-static";

const output = "pages-dist";
const css = await readFile("app/globals.css", "utf8");
const state = dashboardState();
const markup = renderToStaticMarkup(<DashboardClient state={state} />);
const script = `
(() => {
  const organizer = document.querySelector('[data-organizer-filter]');
  const status = document.querySelector('[data-status-filter]');
  const groups = [...document.querySelectorAll('[data-weekend-group]')];
  const apply = () => {
    const org = organizer?.value || 'All organizers';
    const view = status?.value || 'All statuses';
    for (const group of groups) {
      const cards = [...group.querySelectorAll('[data-event-card]')];
      const matches = cards.filter((card) => {
        const outcome = card.dataset.outcome;
        const orgMatch = org === 'All organizers' || card.dataset.organizer === org;
        const statusMatch = view === 'All statuses' ||
          (view === 'Healthy' && outcome === 'success') ||
          (view === 'Watching' && ['not_published', 'not_checked'].includes(outcome)) ||
          (view === 'Needs attention' && outcome === 'failure');
        return orgMatch && statusMatch;
      });
      group.hidden = matches.length === 0;
      for (const card of cards) {
        const isPrimary = card.dataset.role === 'primary';
        card.hidden = !isPrimary && !matches.includes(card);
      }
    }
  };
  organizer?.addEventListener('change', apply);
  status?.addEventListener('change', apply);
})();`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FGF Tourney Tracker | NorCal Softball Tournament Monitor</title>
  <meta name="description" content="Daily 12U tournament entry lists and change history for Northern California softball coaches." />
  <meta name="theme-color" content="#071822" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="FGF Tourney Tracker" />
  <meta property="og:title" content="FGF Tourney Tracker" />
  <meta property="og:description" content="Daily NorCal 12U tournament fields and registration monitoring." />
  <meta property="og:image" content="./og.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="./favicon-32-v2.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon-v2.png" />
  <link rel="manifest" href="./manifest.webmanifest" />
  <style>${css}</style>
</head>
<body>${markup}<script>${script}</script></body>
</html>`;

await mkdir(output, { recursive: true });
await writeFile(`${output}/index.html`, html, "utf8");
await cp("public/favicon-32.png", `${output}/favicon-32.png`);
await cp("public/apple-touch-icon.png", `${output}/apple-touch-icon.png`);
await cp("public/icon-192.png", `${output}/icon-192.png`);
await cp("public/icon-512.png", `${output}/icon-512.png`);
await cp("public/fgf-tourney-tracker-icon.png", `${output}/fgf-tourney-tracker-icon.png`);
await cp("public/favicon-32-v2.png", `${output}/favicon-32-v2.png`);
await cp("public/apple-touch-icon-v2.png", `${output}/apple-touch-icon-v2.png`);
await cp("public/icon-192-v2.png", `${output}/icon-192-v2.png`);
await cp("public/icon-512-v2.png", `${output}/icon-512-v2.png`);
await cp("public/fgf-tourney-tracker-icon-v2.png", `${output}/fgf-tourney-tracker-icon-v2.png`);
await cp("public/og.png", `${output}/og.png`).catch(() => undefined);
await writeFile(`${output}/manifest.webmanifest`, JSON.stringify({
  name: "FGF Tourney Tracker",
  short_name: "FGF Tourneys",
  description: "Daily NorCal 12U tournament fields and registration monitoring.",
  start_url: "./",
  display: "standalone",
  background_color: "#f4f1e9",
  theme_color: "#071822",
  icons: [
    { src: "./icon-192-v2.png", sizes: "192x192", type: "image/png" },
    { src: "./icon-512-v2.png", sizes: "512x512", type: "image/png" },
  ],
}, null, 2));
await cp("data/state.json", `${output}/state.json`);
await writeScoutExports(output, state);
