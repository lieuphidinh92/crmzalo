# Sale Dashboard — Phase 1 Blueprint

Reference locked on 29/08/2026 from the approved dashboard mockup.

## Visual hierarchy

1. Compact monthly KPI strip.
2. Primary working area:
   - left: `Việc quan trọng nhất hôm nay` table;
   - right: KPI Tree and Customer Health.
3. Secondary working area:
   - order/deal pipeline;
   - products to sell today;
   - compact leaderboard.
   - clicking a sale name opens that sale's countable orders for the current
     month; sales with zero countable orders are not rendered.
4. Existing utilities (low stock, processing orders, promotions and quick tools)
   stay below the action-oriented modules.

The existing sale-app design system is authoritative: sidebar, Inter typography,
white cards, `rounded-card`, royal blue, light semantic status colours and current
spacing tokens. Do not introduce a separate dashboard theme.

## Phase 1 data contract

Phase 1 does not change the database schema. It uses:

- `orders` and `order_items` for revenue, activity, frequency, AOV, reorder cycle
  and product history;
- `contacts` for ownership and current pipeline stage;
- `products`, `product_prices` and stock for sell-today recommendations;
- `users` and orders for leaderboard;
- existing business-goal settings only for at-risk/churn thresholds.

Missing targets, deal values and promotion data must render as an explicit
`Chưa cấu hình` / `Chưa đủ dữ liệu` state. Never substitute example numbers.

## Canonical formulas

- Countable order statuses: `confirmed`, `packing`, `shipping`, `completed`,
  `shipped`, `paid`.
- Revenue: `COALESCE(total_amount_value, total_amount)`.
- Sale attribution: `order.assigned_sale_id`; fallback to the contact owner only
  when the order has no assigned sale.
- Active customers (month): distinct customers with a countable order this month.
- Order frequency: countable monthly orders / active monthly customers.
- AOV: monthly revenue / countable monthly orders.
- Reorder cycle: median of gaps between the latest 3–5 countable orders; fallback
  to the sale cohort median, then 30 days.
- Reorder potential: median value of the latest three countable orders.
- Returning rate: monthly customers who also ordered before month start / active
  monthly customers.
- New customer: first-ever countable order falls in the current month.

## Phase boundaries

Phase 1 provides real read-only analytics and actionable navigation. Durable
per-sale monthly targets, promotions, product-pair rules and a deduplicated action
lifecycle remain later phases and require explicit schema approval.
