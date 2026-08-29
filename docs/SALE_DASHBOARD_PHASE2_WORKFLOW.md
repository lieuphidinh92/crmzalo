# Sale Dashboard — Phase 2 Workflow

Implemented on 30/08/2026 on top of the Phase 1 data contract.

## Scope

Phase 2 makes the dashboard operational without a database migration:

- a sale can mark a generated action as completed for today;
- a sale can snooze an action for three days;
- owner/admin can configure monthly KPI targets for each sale;
- KPI strip, KPI Tree and leaderboard use the configured targets and expose the
  largest normalized KPI shortfall.

Promotion rules and explicit product-pair cross-sell rules remain out of scope
because the current database has no authoritative source for either.

## Existing storage reused

### Action lifecycle

Dashboard actions are persisted as existing `tasks` rows. They use canonical
task categories:

- risk/reorder → `REACTIVATION`;
- deal → `UPDATE_NOTE`;
- opportunity → `UPSELL`.

The task `metadata` stores:

- `dashboardSource = sale_dashboard_v2`;
- `dashboardActionKey = <type>:<contactId>`;
- `dashboardActionType`.

A task completed today hides the action until the next day. A pending task with
a future due date hides the action until that date. Ownership is checked against
the contact before either mutation.

### Monthly targets

Targets use the existing `app_settings` row:

`sale_dashboard_targets:YYYY-MM`

The JSON value is keyed by sale ID and can contain revenue, active customers,
order frequency and average order value. Only owner/admin can update it.

## KPI gap logic

For Active Customers, Order Frequency and AOV:

`normalized shortfall = max(0, target - actual) / target`

The KPI with the largest normalized shortfall is highlighted. Revenue progress
and forecast gap are computed from the configured revenue target. Missing target
fields remain explicit and are never inferred from company-wide annual goals.
