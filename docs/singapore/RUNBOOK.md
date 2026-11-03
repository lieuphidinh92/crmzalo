# Warehouse portal operations

## Warehouse identities

- User confirmed 2026-11-03: **58NV1 is the existing Kho Hà Nội**, warehouse `ccec90d0-5524-4ea6-9b29-2a829de8fefd`, organization `7dc86328-624d-4e2d-b0b6-bc62b574a95a`.
- Singapore is a separate organization and warehouse. Legacy sale-app/FIFO cannot consume Singapore lots through shared product IDs.
- Admin and Lê Huỳnh Đức use their existing credentials but must log in independently at each portal. No CRM JWT or other warehouse's session is accepted. Explicit access grants are checked on every request.
- Portal 58NV1: `/warehouse-58nv1` in sale-app. Singapore: dedicated `sing-app` build at `sing.halo.com.vn`.

## Installation

Run the provisioning script from `backend`, with the configured database environment, verified warehouse ID, owner ID and optional operator ID. Default is dry-run and rollback. Add `--apply` only after verifying its output and retaining the backup.

The script installs ten additive portal tables with CHECK constraints, foreign keys and RLS. It creates a separate Singapore organization, grants the named users access and imports three source catalog records. It does not import prices or opening stock. Existing batch quantities, costs and legacy movement history are preserved. The 58NV1 opening snapshot is stored in `wp_baselines`, not as synthetic legacy movements.

Enable routes with `WAREHOUSE_PORTAL_ENABLED=true` only after provisioning. Render's build command is `npm ci && npx prisma generate`; schema changes must be applied deliberately, rather than auto-creating unconstrained tables with `db push`.

The source spreadsheet's prices are pending user verification. Do not swap prices or infer opening stock from a price list.

Product names and package sizes must match at both ends. If a legacy SKU differs, only an administrator may explicitly approve a bidirectional product link after viewing both records. Approval stores both signatures; a later metadata change invalidates it. HC_10 needs this review because its legacy name uses “200 tablets” and has no package size.

## Daily workflow

1. Check warehouse name and country in the fixed header.
2. Create a draft; select product and actual lot. Add quantity, counterparty/reason and any evidence link.
3. Review the full document. Confirm physical work, tick the acknowledgement and type the warehouse's name.
4. A draft never changes stock. Confirmed documents cannot be confirmed twice. Cancel only drafts; returns require a new traceable physical movement.
5. For a transfer, sender dispatches in its own session. Receiver logs into its own warehouse and enters actual quantities; there is no auto-filled 'receive all'. Remaining quantities stay in transit.
6. Only the receiving warehouse administrator can reconcile missing/damaged quantities, with an explicit reason. This does not add available stock. Physically returned goods need a reverse transfer.

Members do not see cost by default. Receipt of transferred goods remains available without cost access; supplier imports and opening values require an explicitly cost-authorized user. Administrators can grant this separately under 'Quyền truy cập'.

## Verification

- `npm run test:warehouse`: disposable PGlite database, no `.env` or production connection. Dedicated real PostgreSQL tests skip unless their strictly loopback-only QA URLs are set.
- `WAREHOUSE_QA_DATABASE_URL`: must point to `127.0.0.1:55488/portal_qa...`; tests two simultaneous exports, exact calendar expiry and balanced report.
- `WAREHOUSE_PROVISION_QA_URL`: must point to `127.0.0.1:55488/portal_qa_provision...`; tests dry-run, first install, RLS, unchanged physical quantities/history and idempotent rerun.
- Module strict TypeScript check passes independently. Full legacy backend `tsc` has existing errors around Prisma client typing and unrelated modules; the established production command uses `tsx`. Do not suppress those errors or claim a full backend compile passed.
- Browser QA: Singapore session cannot enter 58NV1; explicit 58NV1 login, actual partial receipt, cost redaction, mobile 390px and warehouse confirmation gate.
- PostgreSQL DATE values are read as calendar strings through a per-query parser; never change global pg parsers used by the legacy Prisma adapter. Naive legacy timestamps are written/read as UTC; portal timestamps use timestamptz.

## Deployment and rollback

Deploy backend from `feature/sale-app-nhom1`; deploy sale-app and Singapore frontend from `main`. Preserve newer changes in both branches. The sale-app Vercel project already permits source files outside its root, required for the shared portal component.

Verify `/health`, unauthenticated portal endpoints returning 401 (not 404), both frontend bundles and domain HTTPS. Never create fictitious production stock to test a deployment.

If a deployment fails, restore the previous frontend/backend version. To disable the feature, set `WAREHOUSE_PORTAL_ENABLED=false` and revoke portal sessions. Preserve portal documents, receipts, audits and snapshots for investigation; never delete business history as rollback.
