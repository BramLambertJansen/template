// Lege huls van de vervallen hook "effect" (ADR 0091): `node rails/hooks/effect.mjs <event>` doet voor elk event niets: exit 0,
// geen uitvoer, schrijft niets en leest stdin niet. Hij bestaat alleen nog omdat `.claude/settings.json` hem via de stub
// `.claude/hooks/effect.mjs` aanroept; een werkmap met die settings valt anders dicht. Haalt de eigenaar de aanroepen uit
// `.claude/settings.json`, dan verdwijnt dit bestand (ADR 0091 punt 4).
process.exit(0);
