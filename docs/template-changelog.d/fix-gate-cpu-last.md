---
soort: gewijzigd
---

- De beperkte planning van `gate:fast`, Vitest en Playwright (lint en tests na elkaar, minder workers) schakelt nu ook in
  bij een hoge CPU-last: een loadavg over 1 minuut van minstens het aantal cores. Bij krap geheugen én zo'n last draait
  Vitest met één worker (`scripts/kit/geheugen.mjs`, leerpunt #1000). Er vervalt geen check en geen time-out wordt
  ruimer. Het vermindert time-outs als een tweede sessie de machine belast, maar garandeert niets: de meting gebeurt één
  keer bij de start en loopt achter, dus last die later ontstaat, verandert de planning niet.

### Bij een update

- Niets te doen. `GATE_WEINIG_GEHEUGEN=0` zet de parallelle planning ook onder last weer aan.
