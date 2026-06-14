# Migration Strategy

Migrations are intentionally deferred until the full Prisma schema is reviewed.

The earlier `State`/`City`/`Category` proof migration was removed because the project has moved to a schema-first workflow:

1. Complete and review the full Prisma model draft.
2. Review money/storage decisions.
3. Install Prisma dependencies.
4. Run Prisma validation/generation.
5. Generate a fresh migration from the accepted full schema.
6. Add any manual SQL needed for partial unique indexes, text search indexes, trigram indexes, retention cleanup, or database triggers.

Do not run `prisma migrate` until this folder has a fresh migration generated from the final reviewed schema.
