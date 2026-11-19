---
soort: gewijzigd
---

- Eén cloudomgeving voor alle repo's uit de template (spec `cloud-zelfinstallatie`): het veld "Setup script" bevat nu de
  inhoud van `scripts/cloud-omgeving.sh`, dat in de map boven de clone `scripts/cloud-setup.sh` van elke repo zoekt en
  draait. `bash scripts/cloud-setup.sh` in het veld eindigde daar met exit 127. `scripts/cloud-setup.sh` zet Node en
  pnpm via drie routes op `PATH` (koppelingen in `~/.local/bin` naar `mise which`, `CLAUDE_ENV_FILE`, `~/.bashrc`), stopt
  niet meer op een alleen-lezen `~/.bashrc` en gaat door als `apt-get` voor `bubblewrap` en `socat` faalt. Hooks en
  git-hooks draaien in de cloud daardoor op de gepinde Node in plaats van Node 22. `docs/ENVIRONMENT.md` beschrijft de
  opzet, de routes en de meldingen.

### Bij een update

- Wie cloudsessies gebruikt: zet in het veld "Setup script" van de omgeving op claude.ai/code de inhoud van
  `scripts/cloud-omgeving.sh` in plaats van `bash scripts/cloud-setup.sh`, en kies die ene omgeving voor elke repo uit de
  template (`docs/ENVIRONMENT.md`, Opzetten). Zonder cloudsessies hoeft er niets te gebeuren.
