# Food Palace POS

Restaurant POS and sales management (Next.js 15, TypeScript, Tailwind, Prisma, PostgreSQL).
This is **Phase 1**: project setup, full database schema, authentication, roles/permissions and restaurant settings.

## Run it locally

Requires Node 20.6+ and a PostgreSQL database (local, Docker, or a hosted one such as Neon/Supabase).

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL, DIRECT_URL and the SEED_ADMIN_* values
npx prisma migrate dev --name init
npm run db:guards             # installs the "never delete / never edit history" database triggers
npm run db:seed               # roles, permissions, settings, payment methods, first owner
npm run dev
```

Open http://localhost:3000 and sign in with the SEED_ADMIN email and password.
Quick local Postgres with Docker:
`docker run --name fp-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=foodpalace -p 5432:5432 -d postgres:16`

Check it compiles: `npm run typecheck && npm run lint`

## Deploy to Vercel (when you're ready)

1. Create a hosted Postgres database and get a pooled URL and a direct URL.
2. In Vercel, add env vars `DATABASE_URL` (pooled) and `DIRECT_URL` (direct).
3. From your computer, with those two values in `.env`, run `npm run db:setup` once
   (applies migrations, installs the guards, seeds the owner). Re-run `npm run db:deploy && npm run db:guards` after future schema changes.
4. Push to GitHub and import the repo in Vercel. The build command `npm run build` already runs `prisma generate`.

Sessions use an httpOnly cookie and a database session table, so any phone, tablet or laptop can sign in at the same time.

## How the integrity rules are enforced

- **Application level:** there is no delete-order code path. Cancel, refund and void are the only routes (built in phases 3 to 5).
- **Database level:** `prisma/sql/immutability.sql` adds triggers so even a bug or a manual query can't delete orders, payments,
  refunds, audit entries or inventory movements, can't edit audit/status history/order lines, and can't change an order's number,
  billed amounts or a payment's amount. Re-run `npm run db:guards` after migrations (it is safe to repeat).
- **Order numbers** come from `RestaurantSettings.nextOrderNumber`, which can only increase, and `Order.orderNumber` is unique.
- **Money** is `Decimal(12,2)`; order items and payments snapshot names and prices at the time of sale.
- Because of those triggers, demo data can't be wiped by deleting rows. To reset a dev database use `npx prisma migrate reset`.

## Roles

Owner/Admin (everything), Manager, Cashier. Permissions live in the database and the owner can adjust Manager and
Cashier under Settings > Roles & permissions. Permissions are checked on the server for every page and action.

## Phases 8 and 9 (added): reports, audit log, hardening

No schema change, no new packages, no migration. Apply the files and restart.

- **Order-saving fix:** every database transaction now allows up to 60 seconds (Prisma's default is 5). Creating an order is about 15 queries in one transaction,
  and on a remote database that could pass 5 seconds, so the whole order was rolled back with "The order could not be saved". Errors now end with a short
  **Reference** code (for example P2028 = database too slow, P2022 = a column is missing, OUTDATED_CLIENT = run `npx prisma generate` and restart).
- **`npm run db:check`** tests the connection speed, the migration, the protection triggers, settings, payment methods, products and realtime keys, and says what to fix.
- **Reports** (`/reports`): sales (by day, week or month), best-selling products, sales by category, payments by method, orders (by status, type and source),
  top customers (by orders or spending). Each has a range picker (today … custom), a chart, a table and a **Download CSV** button (opens in Excel). Needs the "reports" permission.
- **Audit log** (`/audit`): search, filter by person, action, record type and date range, paginated, with before/after values and links to the record. Owner only by default.
  Entries are protected by database triggers: they cannot be edited or deleted.
- **Hardening:** login is throttled (8 failed tries per email or 25 per address in 15 minutes), owners can sign a staff member out of every device, staff pages are hidden from
  search engines, more security headers (HSTS, permissions policy), friendly error and not-found pages, and loading skeletons.

### Deploying to Vercel (checklist)

1. Hosted Postgres: set `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) in Vercel. If you use Supabase's pooler add `?pgbouncer=true&connection_limit=1` to `DATABASE_URL`.
2. Also add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (realtime), and optionally `SUPABASE_SERVICE_ROLE_KEY`.
3. From your computer with those values in `.env`: `npm run db:setup` (migrations, protection triggers, owner account), then `npm run db:check`.
4. Push to GitHub, import into Vercel. Share `https://your-domain/order` with customers.
5. Change the owner password under Profile, create staff accounts, and set tax, delivery fee and receipt text in Settings.

## Phase 7 and customer ordering (added)

**Needs a database migration, one new package and (optionally) Supabase keys.** See the update steps below.

- **Customer ordering site** at `/order`: browse categories, add dishes (sizes and add-ons), adjust quantities, choose pickup, delivery or dine-in,
  enter details, review and **Place order**. There is no payment of any kind on the website. It says the restaurant handles payment.
  The server recalculates every price, fee and total from the database. Orders arrive as **pending** and **unpaid**, are numbered permanently like any other order,
  and show an **Online** tag. A hidden honeypot field and a per-phone limit (5 orders an hour) deter spam. Turn it off in Settings > Orders.
- **Order tracking** at `/track/<unguessable-id>`: confirmation (order number, summary, total), status steps (pending → accepted → ready → completed, or pending → cancelled)
  and payment status. It updates by itself when staff change the order or record a payment.
- **Live orders** now has exactly five columns: Pending, Accepted, Ready, Cancelled, Completed. Drag cards between columns (or use the buttons on touch screens).
  Cancelling asks for a reason. Cards show order number, customer, phone, type, delivery address, items and quantities, total, payment status and time received.
  There are no Preparing or Out-for-delivery steps any more. Older orders that still carry those statuses show in the nearest column.
- **Realtime** uses Supabase Realtime *Broadcast*. After an order is saved or changed the server sends a tiny message (order id and status codes only, no customer details).
  Every open POS screen and the customer's tracking page react to it. The top bar shows a green dot when connected and the bell shows pending orders.
- **Payment is recorded by staff** on the order page (cash, transfer, card, other), exactly as before. Unpaid becomes part paid or paid, with a payment record and audit entry.
- **Inventory** (`/inventory`): stock levels with low and out-of-stock flags, receive stock, record waste or damage, and count stock. Each change is a recorded movement
  (quantity, reason, who, when). Movement history has filters and pagination. Stock still goes down automatically when an order is completed.

### Updating from the previous version

1. Stop the dev server, apply the update files, then run `npm install` and `npx prisma migrate dev --name customer_ordering`.
2. Add the three Supabase lines from `.env.example` to your `.env` (optional but needed for instant updates), then start `npm run dev`.
3. Share `https://your-site/order` with customers.

## Phase 6 (added)

No schema change and no new packages. Apply the update and restart `npm run dev`.
For sample data to look at: `npm run db:seed:demo` (adds about 50 demo orders with payments over the last 10 days, once only).

- **Dashboard:** real cards (sales, orders, customers, active products), order chart (hourly for one day, daily otherwise), order status counts,
  customer activity for the last 24 hours (new and repeat orders, payments, cancellations) and recent orders. Ranges: today, yesterday, last 7 days,
  last 30 days, this month, custom. Roles without the sales permission don't see money cards.
- **Sales:** gross sales, discounts, refunds, net sales, orders, average order, payments received per method (cash, transfer, card, other), net sales chart and a daily table.
- **Items sold** (`/items`): how many of each product, and of each add-on such as beef, were sold on each day, with a per-size breakdown and a total for the range.
  Choose to count every order placed (default) or completed orders only. Cancelled orders are never counted.
- **What counts as a sale:** an order that is not cancelled and is completed or has a payment. Orders are placed in a period by the day they were created, in the restaurant's timezone.

## Phases 4 and 5 (added)

No schema change and no new packages. Apply the update files and restart `npm run dev`.

- **Payments:** take payment at the POS (pay now / pay later, part payments, cash change, reference numbers) or later from the order page.
  Failed attempts can be logged without touching the balance. A repeated submit never records a payment twice.
- **Refunds and voids:** a refund gives money back (up to what was paid). A void reverses a whole payment entered by mistake and re-opens the balance.
  Payments and billed amounts are never edited; refunds are added as new rows. Cancelling a paid order can refund its payments in one step.
- **Receipts:** `/orders/<id>/receipt` is a printable receipt (browser print). Settings control header, footer, address and phone lines and auto-print.
- **Order flow:** pending → accepted → preparing → ready → (out for delivery, delivery orders only) → completed. Open orders can jump to any step of their own flow;
  completed and cancelled are final. Every change is saved with who and when. Stock goes down once, when an order is completed.
- **Cancelling:** needs a reason and confirmation; saves who, when, why. The order stays on record forever.
- **Pages:** Orders (search, filters, date ranges, pagination), order details with timeline, Live board (refreshes every 15 s), Payments (filters and pagination).
  The bell in the top bar shows pending orders.
- **Balance due** = total − paid. Refunds do not re-open it; voids do.

## Phases 2 and 3 (added)

No schema change, so there is **no new migration**. Copy the new files over your project, run `npm install` (no new packages),
and restart `npm run dev`.

Optional demo data (categories, products with sizes and add-ons, customers, discounts): `npm run db:seed:demo`.
It only adds, never deletes, and refuses to run when `NODE_ENV=production`.

- **Categories:** create, edit, reorder, activate or deactivate.
- **Products:** create/edit with sizes, add-ons, stock tracking and an active flag. Sizes and add-ons are switched off, never removed.
- **Customers:** searchable by name, phone or order number; profile with stats and order history. Phone numbers are normalised (`+234 801…` = `0801…`) so repeat customers aren't duplicated.
- **POS:** category tabs, product grid, size/add-on picker, cart, customer lookup, pickup/delivery/dine-in rules, discount, full bill preview, review step, confirm.
- **Order creation (server):** prices, fees, tax, discount and totals are recalculated from the database; the browser only sends ids and quantities.
  Order numbers come from a row-locked counter that only goes up; a duplicate request returns the same order instead of making a second one.
- **Billing formula:** total = subtotal − discount + service charge (dine-in only) + tax + delivery fee. Tax applies to (subtotal − discount + service charge), not delivery.

## What is in Phase 1

Schema for every model in the spec (plus a few supporting ones), login/logout, staff accounts (create, change role,
deactivate), change password and sign-out-other-devices, settings (restaurant, orders, payment methods, tax/service charge,
discounts, receipts, role permissions), and an audit log written for every one of those actions. The audit log screen itself arrives in phase 8.

## Not yet

Everything else in the sidebar is greyed out with its phase number. Logo and product images are links for now;
file uploads (e.g. Vercel Blob) come with products in phase 2. Login rate limiting and tighter security headers are on the phase 9 list.
