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
  const control = (name) => document.querySelector('[data-' + name + '-filter]');
  const search = control('search');
  const weekend = control('weekend');
  const organizer = control('organizer');
  const status = control('status');
  const registration = control('registration');
  const groups = [...document.querySelectorAll('[data-weekend-group]')];
  const empty = document.createElement('p');
  empty.textContent = 'No tournaments match these filters.';
  empty.hidden = true;
  document.querySelector('.event-list').append(empty);
  const apply = () => {
    const query = search.value.trim().toLocaleLowerCase('en-US');
    const org = organizer.value;
    const view = status.value;
    const reg = registration.value;
    const filtered = query || weekend.value || org !== 'All organizers' || view !== 'All statuses' || reg !== 'All registration';
    let total = 0;
    for (const group of groups) {
      const cards = [...group.querySelectorAll('[data-event-card]')];
      const matches = cards.filter((card) => {
        const data = card.dataset;
        const statusMatch = view === 'All statuses' ||
          (view === 'Healthy' && data.outcome === 'success') ||
          (view === 'Watching' && ['not_published', 'not_checked'].includes(data.outcome)) ||
          (view === 'Needs attention' && data.outcome === 'failure');
        const registrationMatch = reg === 'All registration' ||
          (reg === 'Open or limited' && ['open', 'limited'].includes(data.registration)) ||
          (reg === 'Full, closed, or waitlist' && ['full', 'closed', 'waitlist'].includes(data.registration)) ||
          (reg === 'Invite or not public' && ['invite_only', 'not_public'].includes(data.registration)) ||
          (reg === 'Unknown' && ['unknown', 'not_published'].includes(data.registration));
        return statusMatch && registrationMatch &&
          (org === 'All organizers' || data.organizer === org) &&
          (!weekend.value || data.weekendId === weekend.value) &&
          (!query || data.search.toLocaleLowerCase('en-US').includes(query));
      });
      total += matches.length;
      group.hidden = matches.length === 0;
      for (const card of cards) card.hidden = !matches.includes(card);
      const drawer = group.querySelector('.alternate-drawer');
      if (drawer) {
        drawer.hidden = !matches.some(card => drawer.contains(card));
        drawer.open = Boolean(filtered);
        drawer.querySelector('.alternate-summary-stats').hidden = Boolean(filtered);
        const count = matches.filter(card => drawer.contains(card)).length;
        drawer.querySelector('.alternate-summary-title strong').textContent = 'Compare ' + count + ' alternative' + (count === 1 ? '' : 's');
      }
      const deferred = group.closest('[data-deferred-weekend]');
      if (deferred) { deferred.hidden = group.hidden; deferred.open = Boolean(filtered); }
    }
    empty.hidden = total > 0;
  };
  [weekend, organizer, status, registration].forEach(input => input.addEventListener('change', apply));
  search.addEventListener('input', apply);
  const updateDates = () => {
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    document.querySelectorAll('[data-event-card]').forEach(card => {
      const block = card.querySelector('.event-date-block');
      if (!block) return;
      const days = Math.max(0, Math.round((Date.parse(card.dataset.startDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000));
      block.setAttribute('aria-label', days + ' days until the tournament');
      block.querySelector('small').textContent = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days + 'd';
    });
  };
  apply();
  updateDates();
  window.addEventListener('focus', updateDates);
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
