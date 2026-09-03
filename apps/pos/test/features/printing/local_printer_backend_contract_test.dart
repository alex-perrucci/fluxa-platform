import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/printing/platform/local_printer_backend_contract.dart';

void main() {
  test('builds and labels a Bluetooth serial COM target', () {
    final target = buildBluetoothSerialPrinterTarget(
      port: 'com6',
      name: 'BlueTooth Printer',
    );

    expect(target, 'bluetooth_serial|COM6|BlueTooth Printer');
    expect(isBluetoothPrinterTarget(target), isTrue);
    expect(isBluetoothSerialPrinterTarget(target), isTrue);
    expect(localPrinterTargetLabel(target), 'BlueTooth Printer · COM6');
  });

  test('collapses generic Windows Bluetooth serial names', () {
    final target = buildBluetoothSerialPrinterTarget(
      port: 'COM6',
      name: 'Collegamento standard seriale su Bluetooth (COM6)',
    );

    expect(localPrinterTargetLabel(target), 'Bluetooth · COM6');
  });

  test('keeps classic Bluetooth and Wi-Fi target compatibility', () {
    final bluetooth = buildBluetoothPrinterTarget(
      address: 'AA:BB:CC:DD:EE:FF',
      name: 'Legacy Printer',
    );
    final wifi = buildWifiPrinterTarget(host: '192.168.1.50', port: 9100);

    expect(isBluetoothPrinterTarget(bluetooth), isTrue);
    expect(isBluetoothSerialPrinterTarget(bluetooth), isFalse);
    expect(localPrinterTargetLabel(bluetooth), 'Legacy Printer · Bluetooth');
    expect(isWifiPrinterTarget(wifi), isTrue);
    expect(localPrinterTargetLabel(wifi), '192.168.1.50:9100 · Wi-Fi');
  });
}
