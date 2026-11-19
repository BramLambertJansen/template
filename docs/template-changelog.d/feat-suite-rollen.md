---
soort: gewijzigd
---

- De generieke securitysuite leidt haar actorsoorten af uit `roles.names` van het rollenregister, met per beheerrol een
  soort met en zonder MFA; de MFA-eis staat met de hand in `MFA_ROLLEN` in `test/security/fixtures.ts` (spec
  `suite-volgt-contract`, ontwerp 7, leerpunt #719).

### Bij een update

- Heeft de app een eigen rol, zet die dan in `PERMISSIE_ORACLE['app.use']` en bij elke permissie die de rol krijgt, en een
  beheerrol ook in `MFA_ROLLEN` (`test/security/fixtures.ts`). Tot dan zijn de tests op `appUseVerschil` en `beheerVerschil`
  rood, en `A(rol)`/`B(rol)` gooien voor een rol buiten het register.
