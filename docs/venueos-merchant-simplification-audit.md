# VenueOS merchant simplification audit

## Goal

VenueOS must expose merchant tasks instead of Fluxa implementation concepts. The target navigation is six first-level sections: Home, Menu, Locale, Operatività, Vendite, Impostazioni. Existing deep routes remain available where they still provide useful functionality, but are reached from the task-oriented section that owns them.

## Current route audit

| Current page | Purpose | Decision | Target section |
| --- | --- | --- | --- |
| `/merchant` | Dashboard / overview | KEEP + SIMPLIFY | Home |
| `/merchant/catalog` | Products, categories, VAT, price lists | KEEP + MERGE EXPERIENCE | Menu |
| `/merchant/location` | Locations | MERGE | Locale |
| `/merchant/floor-plan` | Floor plan | MERGE | Locale |
| `/merchant/kitchen-configuration` | Printers and kitchen routing | MERGE | Operatività |
| `/merchant/pos-configuration` | POS devices | MERGE | Operatività |
| `/merchant/events` | Events | MERGE | Operatività |
| `/merchant/reservations` | Reservations | MERGE | Operatività |
| `/merchant/sales` | Orders / sales | KEEP | Vendite |
| `/merchant/payments` | Payments and refunds | MERGE | Vendite |
| `/merchant/fiscal-documents` | Fiscal documents | MERGE | Vendite |
| `/merchant/reports` | Reports | MERGE | Vendite |
| `/merchant/fiscal-configuration` | Fiscal operational status | MERGE, READ-ONLY | Impostazioni |
| `/merchant/health` | Technical diagnostics / support | MERGE + SIMPLIFY | Impostazioni |

## Main findings

1. The current sidebar exposes fourteen first-level destinations, including implementation-oriented concerns that a restaurant operator should not have to classify.
2. The catalog already centralizes products, categories, VAT rates and price lists, but exposes them as four equally important technical tabs. Product creation currently asks for name, code, SKU, barcode, category, VAT, unit, price and availability tracking in the standard path.
3. Fiscal configuration is already read-only for merchants, which is the right authorization model; the UI still exposes the fiscal mode/provider concept and should not.
4. The Home page is currently event/reservation-centric. It does not primarily answer the operator question “Posso lavorare?”.
5. The health page exposes implementation vocabulary such as API, provider and worker names. Merchant-facing status should summarize operational health first and keep diagnostics secondary.

## Implementation plan

1. Replace the fourteen-item merchant navigation with six task-oriented destinations.
2. Add lightweight Locale, Operatività and Impostazioni hubs that link to the existing authoritative pages instead of duplicating backend logic.
3. Redesign the Menu standard path so creating a product requires only name, price and category; derive internal code and default VAT automatically and move list/VAT/internal fields under advanced settings.
4. Make frequent product actions quick: price editing and active/inactive state without reopening a technical form.
5. Simplify Home around operational readiness, POS sales/orders and concise quick actions while retaining access to event/reservation information as secondary context.
6. Remove fiscal provider/mode from the merchant view and simplify merchant diagnostics copy.
7. Keep legacy deep routes functional while they are referenced from their owning task section, then remove only genuinely duplicated UI after verification.

## Compatibility guardrails

- Do not change POS Flutter API contracts.
- Do not change fiscal-worker/ADE_WEB behavior.
- Do not alter order, payment, printing, kitchen, tenant or role semantics just to simplify the web UI.
- Prefer frontend composition and existing APIs; add backend behavior only where a merchant workflow cannot otherwise be made safe.
- Do not introduce schema migrations for UI-only changes.
