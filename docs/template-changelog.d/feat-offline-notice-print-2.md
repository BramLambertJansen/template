---
soort: toegevoegd
---

- Offline-melding en printstijlen in de AppShell (spec `offline-en-print`, `docs/offline-en-print.md`): valt het netwerk weg,
  dan toont de schil onder de topbalk "Je bent offline. …" (`role="status"`) en bij herstel 5 s "Weer online."; nieuw publiek
  component `OfflineNotice` voor schermen zonder AppShell. Bij afdrukken verdwijnen skip-link, sidebar, topbalk, melding en
  toasts, krijgt de inhoud de volle breedte en drukt de app af in het lichte thema. Een app hoeft niets te doen; plaats
  `OfflineNotice` niet zelf binnen de AppShell, want daar staat hij al.
