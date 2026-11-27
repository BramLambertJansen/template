---
soort: gewijzigd
---

- `.env.example` heeft nu `JOBS_DATABASE_URL` (rol `app_jobs`, spec `achtergrondtaken`), en
  `node scripts/kit/nieuwe-app.mjs poorten --env` en `scripts/doctor.sh` nemen de PG-poort ook in die URL mee. Een nieuwe
  lokale checkout start daardoor zonder handwerk.
