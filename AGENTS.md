# Tourneys source control

The user authorized ongoing GitHub commits and pushes on September 6, 2026.
After a cohesive requested change is complete, review the diff, run appropriate
checks, create a descriptive commit, and push the task branch to
`https://github.com/da-vid/FGF-Tourney-Checker.git`. Do this by default unless
the user explicitly requests otherwise. Report any push failure.

GitHub main has a daily collection workflow. Local/Sites collection history may
diverge from it. Preserve both histories on separate branches; never force-push,
overwrite data updates, or automatically merge competing collection results.
The hourly backup preserves local work under `codex-backup/` and Sites source
under `sites-main`. Do not push unrelated work directly to main.

Never commit credentials, runtime environment files, private data exports,
database dumps, browser profiles, or generated build output. Follow the existing
deployment policy; GitHub backup does not authorize a new Sites deployment.
