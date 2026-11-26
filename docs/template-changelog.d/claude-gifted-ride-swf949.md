---
soort: opgelost
---

- De menuknop "Acties voor {naam}" in de accountlijst is tijdens het verversen van de lijst of een lopende actie bezet
  (`Button busy`, aria-disabled) in plaats van `disabled`, en houdt zo de focus. Een uitgeschakelde knop verloor in de browser
  de focus; viel een refetch (zoekterm na de debounce) samen met het sluiten van een dialoog, dan kwam de focus op body in
  plaats van op de menuknop (spec `accountbeheer-uitbreiding`, focusvolgorde; `src/web/features/accounts/row-actions.tsx`).

### Bij een update

- Niets te doen.
