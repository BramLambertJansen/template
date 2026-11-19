---
soort: gewijzigd
---

- `scripts/cloud-setup.sh` zet Node en pnpm via drie routes op `PATH` (spec `cloud-zelfinstallatie`): koppelingen in
  `~/.local/bin` naar `mise which`, een regel in `CLAUDE_ENV_FILE` en dezelfde regel in `~/.bashrc`. Een route die niet te
  schrijven is, geeft een `!`-regel; het script stopt daardoor niet meer op een alleen-lezen `~/.bashrc`, en gaat door als
  `apt-get` voor `bubblewrap` en `socat` faalt. Hooks en git-hooks draaien in de cloud daardoor op de gepinde Node in
  plaats van Node 22. `docs/ENVIRONMENT.md` beschrijft de opzet, de routes en de meldingen.

### Bij een update

- Wie cloudsessies gebruikt: zet in het veld "Setup script" van de omgeving op claude.ai/code de inhoud van
  `scripts/cloud-omgeving.sh` in plaats van `bash scripts/cloud-setup.sh`, en kies die ene omgeving voor elke repo uit de
  template (`docs/ENVIRONMENT.md`, Opzetten). Zonder cloudsessies hoeft er niets te gebeuren.
