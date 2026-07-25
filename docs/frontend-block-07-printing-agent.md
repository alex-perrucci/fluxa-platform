# Frontend Block 07 — Printing queue and Android agent

## Scope

The POS exposes the backend printing queue and can act as the local print agent
on Android devices. The Android app claims durable jobs from the backend, sends
ESC/POS text to the configured thermal printer, and completes or fails the
lease.

## Supported local transports

- Wi-Fi/LAN through a raw TCP socket. Port `9100` is the default used by active
  discovery and suggested by the manual configuration UI.
- Bluetooth Classic RFCOMM/SPP using the standard serial-port UUID.

Generic BLE/GATT printing is intentionally not guessed because service and
characteristic UUIDs vary by printer vendor. A vendor-specific BLE adapter can
be added later without changing the backend job protocol.

## Active discovery

When the operator requests local printer discovery on Android, Fluxa POS now:

1. scans for nearby Bluetooth Classic devices and also includes devices already
   paired in Android;
2. scans the current IPv4 `/24` LAN for hosts accepting raw ESC/POS traffic on
   TCP port `9100`;
3. merges and deduplicates Bluetooth and Wi-Fi targets before exposing them to
   the local printer mapping UI.

A nearby Bluetooth device that is not yet bonded is marked as `da abbinare`.
The Android pairing flow may still be required before the first RFCOMM print.
Wi-Fi printers on a different subnet, VLAN, non-`/24` network, or non-standard
port must be entered manually using the Wi-Fi configuration dialog.

## Android permissions

The manifest declares legacy Bluetooth permissions through Android 11,
location for legacy discovery, and `BLUETOOTH_CONNECT` plus `BLUETOOTH_SCAN` for
Android 12+. The app requests the required runtime permissions only when local
printer discovery is started. Network-state and Wi-Fi-state permissions are
used for LAN discovery.

## Operational flow

1. An administrator configures backend printers, routes, and the Android device
   as `agentDeviceId`.
2. The operator discovers local targets or enters a Wi-Fi endpoint manually,
   then maps each assigned backend printer to a local target.
3. The agent sends heartbeat, claims a job, prints its immutable text snapshot,
   and calls complete or fail using the lease token.
4. Queue monitoring, order/payment receipt requests, kitchen reprints, retry,
   and cancellation remain backed by the existing API contract.

## Deliberate boundaries

- Receipts in this block are commercial, not fiscal.
- The app does not create backend printers or routes.
- Android is the only local printing target. Web remains queue-monitoring only.
- Windows-specific printing code is not included.
