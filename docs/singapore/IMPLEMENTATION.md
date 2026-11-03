# Singapore ↔ 58NV1 warehouse app

Authorized 2026-11-03. Both directions, independent warehouse logins, unmistakable visual identities. No auto-receipt or one-click stock changes.

## Architecture

- `sing-app`: dedicated Vue portal. Singapore teal, 58NV1 amber; warehouse identity pinned at login, header, review and every confirmation.
- `/api/warehouse/v1/:warehouse`: opaque, hashed, revocable sessions bound to one warehouse. CRM JWTs cannot authenticate here. Explicit grants are checked against active users on every request. No cookie sharing or localStorage auth. Login is required separately for each warehouse.
- Singapore uses its own organization/product IDs to prevent legacy FIFO and total-stock queries from consuming Singapore inventory. 58NV1 uses its verified existing warehouse and organization.
- Existing inventory batches/movements remain the stock source of truth. New portal tables hold access, sessions, immutable document snapshots, transfer receipts and audit events.
- Draft → review → type warehouse confirmation → commit. Confirm requires document revision. Every mutation has a client request ID; duplicates cannot repeat movements. Receiving quantities start empty and must be counted.
- Transfers: draft → dispatched → partial → completed. Destination confirms separately; source cannot receive. Unreceived quantities remain in transit until received or explicitly reconciled by an administrator with a reason. Cancellation is draft-only; physical returns use a reverse transfer.
- Price imports remain pending. VND is ledger currency; SGD input records original cents and a fixed per-document VND exchange rate. No adding unrelated currencies.

## Delivery gates

1. Build/test backend against disposable PostgreSQL-compatible database. Verify warehouse isolation, login separation, lost permission, concurrent and duplicate commands, lot expiry, receipt totals and ledger arithmetic.
2. Build both portals; browser QA desktop/mobile and keyboard confirmations.
3. Provision additive tables, identify actual 58NV1 warehouse, create Singapore organization/warehouse, explicitly grant users. Import catalog only; do not fabricate opening stock/prices.
4. Stage with non-production warehouse data; verify stock, existing sale app and two-way transfers.
5. Deploy backend + sale-app + sing-app from the actual Git checkout after reviewing patch. Set `WAREHOUSE_PORTAL_ENABLED=true`; configure `sing.halo.com.vn` and API proxy. Bind 58NV1 portal at `sale.halo.com.vn/warehouse-58nv1`.
6. Read back deployed bundles/APIs, perform agreed production acceptance without fabricated stock; record backup and rollback versions.

No schema or production inventory changes are implicit in starting the frontend. Never run broad `prisma db push` against production for this additive feature.
