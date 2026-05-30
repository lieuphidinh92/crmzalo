# DESIGN SYSTEM — ngheduocsi.vn Sales App

> Tokens, components, and rules to keep the Sales App visually consistent
> with [UI_SPEC.md](./UI_SPEC.md). Reference image: `/sale-app/public/reference-ui.png`.
>
> Inspiration: KiotViet, Alibaba Seller Center, TikTok Shop Seller Center.

---

## 1. Color tokens

### Brand
| Token | Hex | Role |
|---|---|---|
| `--navy-900` | `#0A2540` | Sidebar background, top headlines |
| `--royal-700` | `#1E40AF` | Primary CTA, active tab, link |
| `--royal-600` | `#2563EB` | CTA hover |
| `--amber-500` | `#F59E0B` | Promotion / discount / streak highlight |
| `--amber-100` | `#FEF3C7` | Promotion banner soft bg |

### Surface
| Token | Hex | Role |
|---|---|---|
| `--surface-0` | `#FFFFFF` | Card, modal, input bg |
| `--surface-50` | `#F8FAFC` | Page background |
| `--border-200` | `#E2E8F0` | Default card border, divider |
| `--border-300` | `#CBD5E1` | Input border |

### Text
| Token | Hex | Role |
|---|---|---|
| `--text-primary` | `#0F172A` | Headlines, numbers |
| `--text-secondary` | `#64748B` | Labels, captions, muted |
| `--text-disabled` | `#94A3B8` | Disabled state |
| `--text-on-navy` | `#FFFFFF` | Text on navy sidebar |
| `--text-on-navy-muted` | `#94A3B8` | Secondary text in sidebar |

### Status
| Token | Hex | Role |
|---|---|---|
| `--success-600` | `#16A34A` | Confirmed, paid, profit |
| `--success-50` | `#DCFCE7` | Success badge bg |
| `--danger-600` | `#DC2626` | Out of stock, overdue debt, error |
| `--danger-50` | `#FEE2E2` | Danger badge bg |
| `--warning-500` | `#F59E0B` | Low stock, near expiry |
| `--info-600` | `#0284C7` | Shipping, in-progress |

---

## 2. Typography

**Family:** `Inter`, fallback `-apple-system, system-ui, sans-serif`.
Weight scale: `400` body / `500` label / `600` button / `700` heading.

| Token | Size / line | Use |
|---|---|---|
| `display-xl` | 28 / 36 | Hero KPI number ("18.650.000đ") |
| `display-lg` | 22 / 30 | Page title ("Xin chào, …") |
| `heading-md` | 18 / 26 | Card section title |
| `heading-sm` | 16 / 24 | Sub-section title |
| `body-lg` | 16 / 24 | Form input |
| `body-md` | 14 / 22 | Default body, table row |
| `body-sm` | 13 / 20 | Card subtitle, metadata |
| `caption` | 12 / 18 | Status badge, helper text |
| `overline` | 11 / 16 | UPPERCASE labels |

**VND number format:** dot-separated thousands + `đ` suffix → `18.650.000đ`.
Short form for KPI tiles when ≥ 1tỷ: `1.5 tỷ`, `120tr`, `5k`.

---

## 3. Spacing & radius

Spacing scale (px): `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`.
Use multiples of 4. Cards use `16` padding, page gutter `16` mobile / `24` desktop.

Radius scale: `6` chip, `8` button, `12` card, `16` modal, `9999` pill/avatar.
Shadow: `0 1px 2px rgba(15,23,42,.04)` resting card; `0 6px 24px rgba(15,23,42,.08)` modal/sticky CTA.

---

## 4. Layout

### Mobile (< 768px)
- Top header `56px` (sticky): logo + greeting + notification bell + cart badge.
- Page content with bottom nav clearance `72px`.
- **Bottom nav 5 tabs**, height `64px` + safe-area:
  1. Trang chủ (home icon)
  2. Sản phẩm (box icon)
  3. **Tạo đơn** — emphasised: lifted royal-blue circle `56×56`, white plus icon, sits above nav baseline
  4. Đơn hàng (receipt icon)
  5. Tài khoản (user icon)
- Active tab: royal blue label + 2px top accent.

### Tablet & Desktop (≥ 768px)
- **Left sidebar** `240px` navy-900 bg, white logo + nav links, sticky.
  - Section dividers + small uppercase labels for groups (`Bán hàng`, `Quản lý`).
- **Top bar** `64px` white bg with border-200 bottom: search input (max 480px) + cart badge + notification bell + user avatar.
- Main grid `12-col`, gutter `24`. KPI cards span 3 cols each on `xl`, 6 on `md`.
- Sticky-keep the sidebar; main content scrolls.

---

## 5. Components

### Buttons

| Variant | Bg | Text | Border | Use |
|---|---|---|---|---|
| Primary | `royal-700` | white | none | Main CTA ("Tạo đơn", "Xác nhận") |
| Secondary | white | `royal-700` | `border-200` | Cancel, alt action |
| Ghost | transparent | `text-primary` | none | Toolbar, table action |
| Danger | `danger-600` | white | none | Delete, cancel order |
| Promo | `amber-500` | navy-900 | none | Promotion CTA |

Heights: `40` default, `44` mobile-tap-safe, `48` large primary.
Disabled = opacity 40% + cursor-not-allowed.

### Cards
Standard card: `surface-0` bg, `border-200` border, radius 12, padding 16.
Hover (clickable cards): `border-royal-600` + shadow elevation.

### KPI tile
- 1 line `caption` label ("Doanh số hôm nay") in `text-secondary`.
- 1 line `display-xl` number in `text-primary`.
- 1 line trend chip in `success-600` or `danger-600` ("↑ 24% so với hôm qua").
- Optional right-side icon `40×40` royal-100 bg with royal-700 glyph.

### Promotion banner
Navy-900 → royal-700 gradient bg, white text, amber-500 accent chip, illustration on the right. Pagination dots `8px` at bottom. Mobile: full-width card; desktop: spans 2 KPI columns.

### Product card
- Image `1:1` (or 4:3), object-cover, radius 12 corners.
- Badge top-left for rank (`#1`, `#2`) or "Mới" / "Sale".
- Lines:
  1. SKU `overline` muted
  2. Name `body-md` bold, 2-line clamp
  3. Wholesale price `heading-sm` royal-700
  4. Retail suggested price `caption` strikethrough
  5. Estimated profit `caption` success-600
  6. Stock `caption` muted; if `< 30` → warning, if `0` → danger
  7. Expiry date `caption` (warn if < 90 days)
- Trailing `+ Thêm` royal-700 outline button OR FAB plus on hover.

### Order row (list)
Columns: `Mã đơn (mono)` · `KH + cửa hàng` · `Tổng (right-align bold royal-700)` · `Status pill` · `Sale owner` · `Ngày (relative)`.
Status pills: small radius-6 caption + status colours from §1.

### Status pill
Background = status-50, text = status-600, padding `2 8`, radius `6`.
- Nháp → gray
- Đã xác nhận → info
- Đang đóng gói / giao → amber
- Hoàn tất → success
- Huỷ → danger

### Input / Select
Height 44, radius 10, border `border-300`, focus ring `royal-700` 2px @ 20% opacity. Placeholder `text-disabled`. Search input gets a leading 20px search icon.

### Quantity stepper
`32` height, `border-200` rounded box; `−` / number / `+` cells equal width. Number cell is `text-primary` semibold, monospace digits.

### Modal / drawer
Modal: surface-0, radius 16, max-width 480, padding 20, dim overlay 40%.
Mobile drawer: bottom-sheet, top radius 16, drag handle 36×4 muted.

### Empty state
Centered illustration (max 160px), `heading-sm` title, `body-sm` description, optional primary CTA. Never leave a blank panel.

---

## 6. Icons

Stroke icons (line, 1.75–2px) — use a single set across the app.
Recommended: Lucide / Tabler. Size scale `16 / 20 / 24`. Always paired with text labels on first-use surfaces; icon-only allowed in toolbars after consistent placement.

Reserved domain glyphs:
- Home, Box (product), Cart-plus (create order), Receipt (orders), User (account)
- Bell (notification), Search, Filter, Star, Gift (promotion), Warehouse (stock)

---

## 7. Imagery & illustration

- Product photos on white background, no medical/clinic styling.
- Promotion banner illustrations: gift boxes, ribbons, sparkles — celebratory, NOT clinical.
- Avoid stethoscopes, prescription pads, doctor portraits, lab coats.

---

## 8. Motion

- 150ms ease-out for hover / focus.
- 200ms ease-in-out for drawer + modal.
- 250ms slide-up for sticky cart on mobile.
- Reduce motion: respect `prefers-reduced-motion` — kill non-essential transitions.

---

## 9. Accessibility

- Tap targets ≥ `44×44` on mobile.
- Color contrast ≥ AA. White text on navy-900 = 13.7:1 ✅.
- Status conveyed by colour AND label (badge text).
- Form inputs always have a visible label, no placeholder-only.
- Focus ring visible on every interactive element.

---

## 10. Tailwind mapping (reference)

Recommended `tailwind.config.js` extensions for direct use:

```js
theme: {
  extend: {
    colors: {
      navy:   { 900: '#0A2540' },
      royal:  { 600: '#2563EB', 700: '#1E40AF' },
      amber:  { 100: '#FEF3C7', 500: '#F59E0B' },
      surface:{ 0: '#FFFFFF', 50: '#F8FAFC' },
      ink:    { primary: '#0F172A', secondary: '#64748B', disabled: '#94A3B8' },
    },
    boxShadow: {
      card:  '0 1px 2px rgba(15,23,42,.04)',
      pop:   '0 6px 24px rgba(15,23,42,.08)',
    },
    borderRadius: { card: '12px', modal: '16px' },
  },
}
```

---

## 11. Anti-patterns (DO NOT do)

- ❌ Dark "social network" purple/pink gradients.
- ❌ Doctor profile cards with medical badges.
- ❌ Forum / Q&A layouts (vote arrows, comment trees).
- ❌ Chat bubbles on dashboard.
- ❌ Pastel medical mint/lavender backgrounds.
- ❌ Ambiguous icon-only buttons without labels.
- ❌ Numbers without currency suffix in tables.

---

**Last updated:** 2026-05-30 — initial extraction from UI_SPEC.md + reference mockup.
