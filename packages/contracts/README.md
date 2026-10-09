# @naraclip/contracts

Canonical, runtime-validated boundary contracts shared by API, web, workers, and renderer.

`src/index.ts` is authoritative for shared contracts. Types are derived from Zod schemas; consumers
must parse untrusted payloads at boundaries instead of using type assertions. Fixtures cover the
first visual archetypes:

- `CHARACTER_HUMAN_ANIMAL`
- `GEOGRAPHY_GIS_SATELLITE`
- `MACHINE_TEARDOWN_PHYSICS`

Contract changes require updating the schema, fixtures, and tests in one change.
