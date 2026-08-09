"use client";

import { useMemo, useState } from "react";
import type { ChangeRecord, MonitorState, TournamentState } from "../src/types";

const PACIFIC_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
  timeZoneName: "short",
});

const EVENT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatRange(event: TournamentState): string {
  const start = EVENT_DATE.format(new Date(`${event.startDate}T12:00:00Z`));
  const end = EVENT_DATE.format(new Date(`${event.endDate}T12:00:00Z`));
  return start === end ? start : `${start}–${end}`;
}

function daysUntil(date: string): number {
  const target = new Date(`${date}T12:00:00-07:00`).getTime();
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}

function outcomeLabel(event: TournamentState): string {
  if (event.outcome === "failure") return "Source needs attention";
  if (event.outcome === "not_published") return "Not yet published";
  if (event.outcome === "not_checked") return "First check pending";
  if (event.teams.length === 0 && event.registrationStatus) return "Roster not public";
  if (event.teams.length === 0) return "No 12U teams posted";
  return `${event.teams.length} team${event.teams.length === 1 ? "" : "s"} posted`;
}

function statusClass(event: TournamentState): string {
  if (event.outcome === "failure") return "health health-error";
  if (event.outcome === "not_published" || event.outcome === "not_checked" || (event.teams.length === 0 && event.registrationStatus)) {
    return "health health-watch";
  }
  return "health health-good";
}

function changeLabel(change: ChangeRecord): string {
  return {
    team_added: "Added",
    team_removed: "Removed",
    confirmed_changed: "Confirmed",
    paid_changed: "Payment",
    event_published: "Published",
    source_unhealthy: "Source alert",
    source_recovered: "Source restored",
  }[change.type];
}

function TournamentCard({
  event,
  compact = false,
  showRole = false,
  sharedTeamCounts,
  lastChange,
}: {
  event: TournamentState;
  compact?: boolean;
  showRole?: boolean;
  sharedTeamCounts: Map<string, number>;
  lastChange?: ChangeRecord;
}) {
  const pendingNames = new Set(event.pendingRemovals.map((item) => item.team.normalizedName));
  const days = daysUntil(event.startDate);

  return (
    <article
      className={`event-card${compact ? " event-card-alternate" : ""}`}
      data-event-card
      data-organizer={event.organizer}
      data-outcome={event.outcome}
      data-role={event.role}
    >
      {!compact && (
        <div className="event-date-block" aria-label={`${days} days until the tournament`}>
          <span>{new Date(`${event.startDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>
          <strong>{new Date(`${event.startDate}T12:00:00Z`).getUTCDate()}</strong>
          <small>{days === 0 ? "Game day" : `${days}d`}</small>
        </div>
      )}

      <div className="event-main">
        <div className="event-heading">
          <div>
            <div className="event-heading-meta">
              {showRole && <span className={`role-badge role-${event.role}`}>{event.role === "primary" ? "Primary plan" : "Alternative"}</span>}
              <p className="event-kicker">{event.organizer} · {formatRange(event)}</p>
            </div>
            <h3>{event.name}</h3>
            <p className="location">{event.location}</p>
          </div>
          <span className={statusClass(event)}>{outcomeLabel(event)}</span>
        </div>

        {event.outcome === "failure" ? (
          <div className="source-message error-message">
            Today’s check did not complete. The last successful roster is preserved.
          </div>
        ) : event.outcome === "not_published" ? (
          <div className="source-message watch-message">
            {event.registrationStatus ?? "The organizer has not published this event or roster yet."}
          </div>
        ) : event.outcome === "not_checked" ? (
          <div className="source-message watch-message">The first automated collection is pending.</div>
        ) : event.teams.length === 0 ? (
          <div className={`source-message ${event.registrationStatus ? "watch-message" : "neutral-message"}`}>
            {event.registrationStatus ?? "The official source currently shows no 12U entrants."}
          </div>
        ) : (
          <div className="team-grid" aria-label={`${event.teams.length} entered teams`}>
            {event.teams.map((team) => {
              const sharedCount = sharedTeamCounts.get(team.normalizedName) ?? 1;
              return (
                <div className={`team-row${pendingNames.has(team.normalizedName) ? " team-pending" : ""}`} key={team.normalizedName}>
                  <span className="team-name">{team.rawName}</span>
                  <span className="team-flags">
                    {team.confirmed === "yes" && <span className="flag flag-confirmed">Confirmed</span>}
                    {team.paid === "yes" && <span className="flag flag-paid">Paid</span>}
                    {team.note && <span className="flag flag-note">{team.note}</span>}
                    {sharedCount > 1 && <span className="flag flag-shared">Also in {sharedCount - 1} option{sharedCount === 2 ? "" : "s"}</span>}
                    {pendingNames.has(team.normalizedName) && <span className="flag flag-pending">Verify removal</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <footer className="event-footer">
          <span>
            {event.lastSuccessfulCheck
              ? `Checked ${PACIFIC_DATE.format(new Date(event.lastSuccessfulCheck))}`
              : "Awaiting first successful check"}
          </span>
          {lastChange && <span>Last change {PACIFIC_DATE.format(new Date(lastChange.occurredAt))}</span>}
          <a href={event.sourceUrl} target="_blank" rel="noreferrer">
            Official source <span aria-hidden="true">↗</span>
          </a>
        </footer>
      </div>
    </article>
  );
}

function WeekendGroup({
  events,
  allEvents,
  changes,
}: {
  events: TournamentState[];
  allEvents: TournamentState[];
  changes: ChangeRecord[];
}) {
  const primary = allEvents.find((event) => event.role === "primary") ?? allEvents[0];
  const alternatives = events.filter((event) => event.role === "alternate");
  const hasAlternatives = allEvents.some((event) => event.role === "alternate");
  const sharedTeamCounts = new Map<string, number>();
  for (const event of allEvents) {
    for (const team of event.teams) sharedTeamCounts.set(team.normalizedName, (sharedTeamCounts.get(team.normalizedName) ?? 0) + 1);
  }
  const lastChangeByEvent = new Map<string, ChangeRecord>();
  for (const change of changes) if (!lastChangeByEvent.has(change.tournamentId)) lastChangeByEvent.set(change.tournamentId, change);

  if (!hasAlternatives) {
    return (
      <div className="standalone-weekend" data-weekend-group>
        <TournamentCard event={primary} sharedTeamCounts={sharedTeamCounts} lastChange={lastChangeByEvent.get(primary.id)} />
      </div>
    );
  }

  const healthyAlternatives = alternatives.filter((event) => event.outcome === "success").length;
  const listedSlots = alternatives.reduce((sum, event) => sum + event.teams.length, 0);
  const leader = alternatives.reduce<TournamentState | undefined>(
    (best, event) => (!best || event.teams.length > best.teams.length ? event : best),
    undefined,
  );

  return (
    <section className="weekend-group" data-weekend-group data-weekend-id={primary.weekendId}>
      <header className="weekend-banner">
        <div>
          <span>Locked play weekend</span>
          <strong>{formatRange(primary)}</strong>
        </div>
        <p>{allEvents.length} tournament options monitored daily</p>
      </header>

      <TournamentCard
        event={primary}
        showRole
        sharedTeamCounts={sharedTeamCounts}
        lastChange={lastChangeByEvent.get(primary.id)}
      />

      {alternatives.length > 0 && (
        <details className="alternate-drawer">
          <summary>
            <div className="alternate-summary-title">
              <span>Alternate field watch</span>
              <strong>Compare {alternatives.length} alternative{alternatives.length === 1 ? "" : "s"}</strong>
            </div>
            <div className="alternate-summary-stats">
              <span>{healthyAlternatives}/{alternatives.length} sources healthy</span>
              <span>{listedSlots} listed team slots</span>
              {leader && leader.teams.length > 0 && <span>Largest field: {leader.name} ({leader.teams.length})</span>}
            </div>
            <span className="drawer-icon" aria-hidden="true">+</span>
          </summary>
          <div className="alternate-list">
            {alternatives.map((event) => (
              <TournamentCard
                compact
                showRole
                event={event}
                key={event.id}
                sharedTeamCounts={sharedTeamCounts}
                lastChange={lastChangeByEvent.get(event.id)}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export function DashboardClient({ state }: { state: MonitorState }) {
  const [organizer, setOrganizer] = useState("All organizers");
  const [view, setView] = useState("All statuses");
  const organizers = useMemo(
    () => ["All organizers", ...Array.from(new Set(state.tournaments.map((event) => event.organizer))).sort()],
    [state.tournaments],
  );
  const matches = (event: TournamentState) => {
    const organizerMatch = organizer === "All organizers" || event.organizer === organizer;
    const statusMatch =
      view === "All statuses" ||
      (view === "Healthy" && event.outcome === "success") ||
      (view === "Watching" && ["not_published", "not_checked"].includes(event.outcome)) ||
      (view === "Needs attention" && event.outcome === "failure");
    return organizerMatch && statusMatch;
  };
  const groups = useMemo(() => {
    const map = new Map<string, TournamentState[]>();
    for (const event of state.tournaments) {
      const group = map.get(event.weekendId) ?? [];
      group.push(event);
      map.set(event.weekendId, group);
    }
    return [...map.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, events]) => ({ id, events }));
  }, [state.tournaments]);
  const visibleGroups = groups.flatMap((group) => {
    const matching = group.events.filter(matches);
    if (matching.length === 0) return [];
    const primary = group.events.find((event) => event.role === "primary") ?? group.events[0];
    const filteredEvents = [primary, ...matching.filter((event) => event.id !== primary.id)];
    return [{ ...group, filteredEvents }];
  });
  const eventById = new Map(state.tournaments.map((event) => [event.id, event]));
  const recentChanges = state.changes.slice(0, 6);
  const primaryEvents = state.tournaments.filter((event) => event.role === "primary");
  const next = [...primaryEvents].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const healthyCount = state.tournaments.filter((event) => event.outcome === "success").length;

  return (
    <main>
      <section className="hero">
        <nav className="topbar" aria-label="Site identity">
          <a className="brand" href="#top" aria-label="12U Field Watch home">
            <span className="brand-mark" aria-hidden="true">12</span>
            <span>FIELD WATCH</span>
          </a>
          <span className="division-chip">NORCAL · 12U</span>
        </nav>

        <div className="hero-grid" id="top">
          <div className="hero-copy">
            <p className="eyebrow">Fall 2026 tournament intelligence</p>
            <h1>Who’s in<br />the field?</h1>
            <p className="lede">
              A daily comparison of our primary tournament plan and every listed alternative on the same locked weekends.
            </p>
            <p className="freshness">
              <span className="pulse" aria-hidden="true" />
              Updated {PACIFIC_DATE.format(new Date(state.generatedAt))}
            </p>
          </div>

          <div className="scoreboard" aria-label="Tournament monitor summary">
            <div className="score-cell score-primary">
              <span>Weekends watched</span>
              <strong>{groups.length}</strong>
            </div>
            <div className="score-cell">
              <span>Tournament options</span>
              <strong>{state.tournaments.length}</strong>
            </div>
            <div className="score-cell">
              <span>Sources healthy</span>
              <strong>{healthyCount}<small>/{state.tournaments.length}</small></strong>
            </div>
            <div className="score-cell score-next">
              <span>Next play weekend</span>
              <strong>{next ? formatRange(next) : "—"}</strong>
              <small>{next?.name ?? "No upcoming event"}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="content-shell">
        <aside className="change-panel" aria-labelledby="changes-heading">
          <div className="section-title-row">
            <div>
              <p className="section-number">01</p>
              <h2 id="changes-heading">Latest movement</h2>
            </div>
            <span className="live-label">Daily log</span>
          </div>
          {recentChanges.length ? (
            <ol className="change-list">
              {recentChanges.map((change) => {
                const event = eventById.get(change.tournamentId);
                return (
                  <li key={change.id}>
                    <div className="change-label-row">
                      <span className={`change-type change-${change.type}`}>{changeLabel(change)}</span>
                      {event && <span className="change-context">{event.role === "primary" ? "Primary" : "Alternate"} · {formatRange(event)}</span>}
                    </div>
                    {event && <strong className="change-event">{event.name}</strong>}
                    <p>{change.detail}</p>
                    <time>{PACIFIC_DATE.format(new Date(change.occurredAt))}</time>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="empty-log">
              <span aria-hidden="true">◇</span>
              <p>The first successful collection establishes the baseline. Changes will appear here after that.</p>
            </div>
          )}
        </aside>

        <section className="events-section" aria-labelledby="events-heading">
          <div className="events-toolbar">
            <div>
              <p className="section-number">02</p>
              <h2 id="events-heading">Weekend board</h2>
            </div>
            <div className="filters">
              <label>
                <span className="sr-only">Filter by organizer</span>
                <select value={organizer} onChange={(event) => setOrganizer(event.target.value)} data-organizer-filter>
                  {organizers.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by source status</span>
                <select value={view} onChange={(event) => setView(event.target.value)} data-status-filter>
                  <option>All statuses</option>
                  <option>Healthy</option>
                  <option>Watching</option>
                  <option>Needs attention</option>
                </select>
              </label>
            </div>
          </div>

          <div className="event-list">
            {visibleGroups.map((group) => (
              <WeekendGroup key={group.id} events={group.filteredEvents} allEvents={group.events} changes={state.changes} />
            ))}
          </div>
          {visibleGroups.length === 0 && <p className="no-results">No tournament weekends match these filters.</p>}
        </section>
      </section>

      <section className="legend-section" aria-labelledby="legend-heading">
        <div>
          <p className="section-number">03</p>
          <h2 id="legend-heading">How to read the board</h2>
        </div>
        <div className="legend-grid">
          <p><span className="legend-dot good" /> <strong>Healthy</strong> means the official source loaded successfully—even when it lists zero teams.</p>
          <p><span className="legend-dot watch" /> <strong>Watching</strong> includes unpublished events and events whose organizers have not exposed a public roster.</p>
          <p><span className="legend-dot error" /> <strong>Needs attention</strong> preserves the last good roster while the source is unavailable.</p>
          <p><span className="legend-dot pending" /> <strong>Verify removal</strong> requires a second successful observation before a team is removed.</p>
        </div>
      </section>

      <footer className="site-footer">
        <p>12U Field Watch reflects publicly posted organizer information. Official tournament sources control.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
