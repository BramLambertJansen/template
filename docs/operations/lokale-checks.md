# Lokale lint versnellen

Developer-stop en pre-push gebruiken `node scripts/kit/local-gate.mjs`. De helper leest de snelle gates uit het bestaande
register en voert ze in dezelfde volgorde uit (`scripts/kit/local-gate.mjs:23`). Elke fout stopt de uitvoering.
De handmatige opdracht `pnpm gate:fast` en CI houden de bestaande ongecachete opdrachten.

Alleen lint gebruikt de eigen cache van ESLint. Een sleutel over projectinhoud, daadwerkelijke dependencies,
Node-binary en de werkelijke lintomgeving kiest of een vorige cache bruikbaar is (`scripts/kit/lint-inputs.mjs`).
Stagen en committen veranderen de sleutel niet als bestanden gelijk blijven. Een gewijzigde typebron maakt de gehele
lintcache ongeldig; alleen per bestand cachen zou fouten in onveranderde afnemers kunnen missen.

De helper ondersteunt de huidige onderzochte ESLint-config en TypeScript-projectindeling. De digests daarvan begrenzen
de ondersteunde configuratie. Een gewijzigde configuratie of lintopdracht, extra project, externe bron of declaratie,
externe symlink, packages in bovenliggende mappen, `NODE_OPTIONS` of een externe `NODE_PATH` geeft gewone lint. Onderzoek een nieuwe
indeling en breid de negatieve tests uit voordat je haar digests aanpast. Een nieuwe digest alleen bewijst geen veilige invoer.
Lint draait direct met de gecontroleerde Node-binary en de lokale ESLint-entry; hiervoor wordt geen shell gebruikt.
Git-/Claude-/Lefthook-variabelen, shelltellers, `OLDPWD`, `PATH` en kleurkeuzes verdwijnen zowel uit de sleutel als uit de
lintomgeving; `PWD` wordt de werkmap en `NO_COLOR` wordt `1`. Een door pnpm toegevoegde `NODE_PATH` is alleen toegestaan
als alle entries binnen de gecontroleerde `node_modules` liggen, en wordt daarna ook verwijderd. Zo verschillen
developer-stop en pre-push niet door hun launcher. Andere runtimeoverrides geven gewone lint. Overige omgevingswaarden
gaan alleen gehasht de sleutel in; `.env*` wordt niet gelezen.

De cache staat onder de tijdelijke systeemmap, per werkmap in `template-lint-cache/<werkmapdigest>/lint.json`.
ESLint krijgt per run een eigen tijdelijk bestand. Publicatie is atomair en gebeurt alleen na geslaagde lint en gelijke
invoer vóór en na de controle (`scripts/kit/cached-lint.mjs`). Rood of onderbreking publiceert niets. Bij veranderde
invoer volgt een ongecachete hercontrole. Een ontbrekende of onleesbare cache geeft een verse controle; een onbruikbare
cachemap geeft gewone lint. Verwijderen van alleen dit cachebestand is voldoende om de volgende run vers te laten beginnen.

Een oudere checkout zonder helper houdt via developer-stop de bestaande volledige snelle gate. CI en de runner
gebruiken de cache niet, ook als iemand daar de lokale helper aanroept. PR-verificatie en onafhankelijke review
blijven hun eigen bewijs verzamelen. De cache is lokale feedback, geen veiligheidsgrens of CI-bouwbewijs.
