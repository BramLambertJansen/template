---
soort: opgelost
---

- `scripts/kit/pnpm-installeer.mjs` laat pnpm in een terminal weer stdin, stdout en stderr erven (voortgangsbalk en kleur),
  en geeft SIGINT, SIGTERM en SIGHUP door aan pnpm: de module ruimt daarna de setup-basismap op en stopt met
  `✗ pnpm install gestopt door <SIGNAAL>` en exit 128 plus het signaalnummer (spec `pnpm-sandbox-installatie`, AC-8 en AC-9).
