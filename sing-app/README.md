# HALO Warehouse

Dedicated Singapore portal; the same Vue component is mounted by sale-app at `/warehouse-58nv1` with the amber 58NV1 identity. Singapore uses teal. Sessions are separate, server-verified and stored only in sessionStorage.

```sh
npm ci
npm run build
```

For a disposable local preview, start `backend/tests/warehouse-portal/preview.ts` with `node --import tsx`, then `npm run dev` here. The preview API uses an in-memory database, never DATABASE_URL. QA users/password are printed by the preview process. Development builds display a clear test-data badge.

See `docs/singapore/RUNBOOK.md` for provisioning, access, two-way transfers and deployment.
