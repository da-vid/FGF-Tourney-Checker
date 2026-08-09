import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardClient } from "../app/DashboardClient";
import { dashboardState } from "../app/page";

const output = "pages-dist";
const css = await readFile("app/globals.css", "utf8");
const markup = renderToStaticMarkup(<DashboardClient state={dashboardState()} />);
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
  <title>12U Field Watch | NorCal Tournament Monitor</title>
  <meta name="description" content="Daily 12U tournament entry lists and change history for Northern California softball coaches." />
  <meta property="og:title" content="12U Field Watch" />
  <meta property="og:description" content="Who joined the field? Daily NorCal 12U tournament entry monitoring." />
  <meta property="og:image" content="./og.png" />
  <link rel="icon" href="./favicon.svg" />
  <style>${css}</style>
</head>
<body>${markup}<script>${script}</script></body>
</html>`;

await mkdir(output, { recursive: true });
await writeFile(`${output}/index.html`, html, "utf8");
await cp("public/favicon.svg", `${output}/favicon.svg`);
await cp("public/og.png", `${output}/og.png`).catch(() => undefined);
await cp("data/state.json", `${output}/state.json`);
