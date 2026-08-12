# Pilot boundary — VenueOS control plane

## Decision

For the pilot, Fluxa keeps one authoritative configuration model in the API and PostgreSQL while separating the user interfaces by responsibility.

### VenueOS owns business and logical configuration

- categories;
- VAT rates;
- products;
- price lists and location assignment;
- locations, rooms and tables;
- kitchen stations;
- category-to-kitchen routing;
- logical print routing;
- POS device location and operator mode;
- the existing fiscal/backoffice configuration surfaces.

The Next.js application remains a BFF/UI. It does not duplicate the domain or persist a second configuration model.

### POS owns service-time operation and local hardware

- catalog consumption;
- tables and orders;
- kitchen execution;
- checkout, payments and refunds;
- fiscal operation;
- print queue;
- creation/assignment of a logical printer to the current POS;
- Wi-Fi/Bluetooth discovery and local printer mapping;
- test printing and diagnostics;
- synchronization of the operational context from VenueOS.

The generic POS business-administration feature has been removed from the POS source and runtime graph. Business configuration is exposed only through VenueOS; the POS keeps only its dedicated local printer setup and operational diagnostics surfaces.

## Printer boundary

A printer has two concerns that intentionally remain separate:

1. **Logical routing** — VenueOS decides which logical printer receives a kitchen ticket, order receipt or payment receipt.
2. **Physical transport** — the POS maps a logical printer assigned to that device to the real Wi-Fi/Bluetooth target and executes the job locally.

VenueOS can read logical printers for routing but its configuration BFF does not allow printer creation or mutation. Printer setup remains a POS responsibility.

## Pilot freeze

This refactor does not add database tables or migrations. It reuses existing catalog, hospitality, printing and device contracts and adds only a tenant/location-scoped read endpoint for existing category-to-kitchen mappings.
