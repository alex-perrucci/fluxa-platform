# Frontend Block 07 — Printing queue and Android agent

## Scope

The POS now exposes the backend printing queue and can act as the local print
agent on Android devices. The Android app claims durable jobs from the backend,
sends ESC/POS text to the configured thermal printer, and completes or fails the
lease.

## Supported local transports

- Wi-Fi/LAN through a raw TCP socket. Port `9100` is the default suggested by the UI.
- Bluetooth Classic RFCOMM/SPP using a printer already paired in Android settings.

Generic BLE/GATT printing is intentionally not guessed because service and
characteristic UUIDs vary by printer vendor. A vendor-specific BLE adapter can be
added later without changing the backend job protocol.

## Android permissions

The manifest declares legacy Bluetooth permissions through Android 11 and
`BLUETOOTH_CONNECT` for Android 12+. The app asks for the Nearby devices runtime
permission only when paired Bluetooth printers are requested. Wi-Fi printing does
not require Bluetooth permission.

## Operational flow

1. An administrator configures backend printers, routes, and the Android device as
   `agentDeviceId`.
2. The operator maps each assigned backend printer to either a Wi-Fi endpoint or a
   paired Bluetooth printer.
3. The agent sends heartbeat, claims a job, prints its immutable text snapshot, and
   calls complete or fail using the lease token.
4. Queue monitoring, order/payment receipt requests, kitchen reprints, retry, and
   cancellation remain backed by the existing API contract.

## Deliberate boundaries

- Receipts in this block are commercial, not fiscal.
- The app does not create backend printers or routes.
- Android is the only local printing target. Web remains queue-monitoring only.
- Windows-specific printing code is not included.
