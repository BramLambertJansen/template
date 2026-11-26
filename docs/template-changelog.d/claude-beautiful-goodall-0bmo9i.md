---
soort: opgelost
---

- De racetests van AC-10a uit spec `rollenregister` (`test/auth/roles-races.int.test.ts`) waren afhankelijk van timing.
  `app.assign_role` en `app.set_account_blocked` controleren de actor vóór de lock van de laatste-beheerder-regel. Committe
  de ene kant voordat de andere aan die controle toekwam, dan kreeg de verliezer `FORBIDDEN` in plaats van `LAST_ADMIN`.
  De tests houden die lock nu vast tot beide aanroepen erop wachten, zodat de regel zelf beslist. De asserts zijn
  ongewijzigd en de databasecode ook.

### Bij een update

- Niets te doen.
