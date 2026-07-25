package it.fluxa.fluxa_pos

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.Charset
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : FlutterActivity() {
    companion object {
        private const val CHANNEL = "it.fluxa.fluxa_pos/printing"
        private const val BLUETOOTH_PERMISSION_REQUEST = 7107
        private const val RAW_PRINT_PORT = 9100
        private const val WIFI_CONNECT_TIMEOUT_MS = 180
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }

    private var pendingBluetoothPermissionResult: MethodChannel.Result? = null
    private var pendingBluetoothDiscoveryResult: MethodChannel.Result? = null
    private var bluetoothDiscoveryReceiver: BroadcastReceiver? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "ensureBluetoothPermission" -> ensureBluetoothPermission(result)
                    "discoverBluetoothPrinters" -> discoverBluetoothPrinters(result)
                    "discoverWifiPrinters" -> discoverWifiPrinters(result)
                    "listPairedBluetoothPrinters" -> listPairedBluetoothPrinters(result)
                    "printText" -> printText(call, result)
                    else -> result.notImplemented()
                }
            }
    }

    override fun onDestroy() {
        stopBluetoothDiscovery()
        super.onDestroy()
    }

    private fun ensureBluetoothPermission(result: MethodChannel.Result) {
        val missing = requiredBluetoothPermissions().filter {
            checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            result.success(true)
            return
        }
        if (pendingBluetoothPermissionResult != null) {
            result.error("BLUETOOTH_PERMISSION_PENDING", "Richiesta Bluetooth già in corso.", null)
            return
        }
        pendingBluetoothPermissionResult = result
        requestPermissions(missing.toTypedArray(), BLUETOOTH_PERMISSION_REQUEST)
    }

    private fun requiredBluetoothPermissions(): List<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
        } else {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == BLUETOOTH_PERMISSION_REQUEST) {
            val granted = grantResults.isNotEmpty() &&
                grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            pendingBluetoothPermissionResult?.success(granted)
            pendingBluetoothPermissionResult = null
        }
    }

    private fun discoverBluetoothPrinters(result: MethodChannel.Result) {
        if (!hasBluetoothDiscoveryPermission()) {
            result.error(
                "BLUETOOTH_PERMISSION_REQUIRED",
                "Autorizza dispositivi nelle vicinanze e scansione Bluetooth.",
                null,
            )
            return
        }
        if (pendingBluetoothDiscoveryResult != null) {
            result.error("BLUETOOTH_DISCOVERY_PENDING", "Ricerca Bluetooth già in corso.", null)
            return
        }

        val adapter = getSystemService(BluetoothManager::class.java)?.adapter
        if (adapter == null || !adapter.isEnabled) {
            result.success(emptyList<Map<String, String>>())
            return
        }

        val devices = linkedMapOf<String, Map<String, String>>()
        try {
            adapter.bondedDevices.forEach { device -> devices[device.address] = devicePayload(device) }
        } catch (_: SecurityException) {
            result.error("BLUETOOTH_PERMISSION_REQUIRED", "Autorizzazione Bluetooth non concessa.", null)
            return
        }

        pendingBluetoothDiscoveryResult = result
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    BluetoothDevice.ACTION_FOUND -> {
                        val device = bluetoothDeviceExtra(intent) ?: return
                        try {
                            devices[device.address] = devicePayload(device)
                        } catch (_: SecurityException) {
                            // A revoked permission is reported when discovery finishes.
                        }
                    }
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                        finishBluetoothDiscovery(devices.values.toList())
                    }
                }
            }
        }
        bluetoothDiscoveryReceiver = receiver
        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(receiver, filter)
        }

        try {
            if (adapter.isDiscovering) {
                adapter.cancelDiscovery()
            }
            if (!adapter.startDiscovery()) {
                finishBluetoothDiscovery(devices.values.toList())
            }
        } catch (error: SecurityException) {
            stopBluetoothDiscovery()
            pendingBluetoothDiscoveryResult?.error(
                "BLUETOOTH_PERMISSION_REQUIRED",
                error.message,
                null,
            )
            pendingBluetoothDiscoveryResult = null
        }
    }

    @Suppress("DEPRECATION")
    private fun bluetoothDeviceExtra(intent: Intent): BluetoothDevice? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
        }

    private fun devicePayload(device: BluetoothDevice): Map<String, String> {
        val name = device.name?.trim().orEmpty().ifEmpty { device.address }
        val paired = device.bondState == BluetoothDevice.BOND_BONDED
        return mapOf(
            "address" to device.address,
            "name" to if (paired) name else "$name (da abbinare)",
        )
    }

    private fun finishBluetoothDiscovery(devices: List<Map<String, String>>) {
        val sorted = devices.sortedBy { it["name"]?.lowercase() }
        stopBluetoothDiscovery()
        pendingBluetoothDiscoveryResult?.success(sorted)
        pendingBluetoothDiscoveryResult = null
    }

    private fun stopBluetoothDiscovery() {
        bluetoothDiscoveryReceiver?.let {
            try {
                unregisterReceiver(it)
            } catch (_: IllegalArgumentException) {
                // Receiver was already unregistered.
            }
        }
        bluetoothDiscoveryReceiver = null
        try {
            getSystemService(BluetoothManager::class.java)?.adapter?.let { adapter ->
                if (hasBluetoothDiscoveryPermission() && adapter.isDiscovering) {
                    adapter.cancelDiscovery()
                }
            }
        } catch (_: SecurityException) {
            // Permission may have been revoked while scanning.
        }
    }

    private fun listPairedBluetoothPrinters(result: MethodChannel.Result) {
        if (!hasBluetoothConnectPermission()) {
            result.error("BLUETOOTH_PERMISSION_REQUIRED", "Autorizza i dispositivi nelle vicinanze.", null)
            return
        }
        val adapter = getSystemService(BluetoothManager::class.java)?.adapter
        if (adapter == null) {
            result.success(emptyList<Map<String, String>>())
            return
        }
        try {
            result.success(adapter.bondedDevices.map(::devicePayload).sortedBy { it["name"]?.lowercase() })
        } catch (error: SecurityException) {
            result.error("BLUETOOTH_PERMISSION_REQUIRED", error.message, null)
        }
    }

    private fun discoverWifiPrinters(result: MethodChannel.Result) {
        Thread {
            try {
                val printers = scanLocalSubnetForRawPrinters()
                runOnUiThread { result.success(printers) }
            } catch (error: Throwable) {
                val message = error.message ?: error.javaClass.simpleName
                runOnUiThread { result.error("WIFI_DISCOVERY_FAILED", message.take(500), null) }
            }
        }.start()
    }

    private fun scanLocalSubnetForRawPrinters(): List<Map<String, Any>> {
        val connectivity = getSystemService(ConnectivityManager::class.java)
        val network = connectivity.activeNetwork ?: return emptyList()
        val localAddress = connectivity.getLinkProperties(network)
            ?.linkAddresses
            ?.map { it.address }
            ?.filterIsInstance<Inet4Address>()
            ?.firstOrNull { !it.isLoopbackAddress }
            ?: return emptyList()

        val bytes = localAddress.address
        val prefix = "${bytes[0].toInt() and 0xff}.${bytes[1].toInt() and 0xff}.${bytes[2].toInt() and 0xff}"
        val ownHost = localAddress.hostAddress
        val found = ConcurrentHashMap.newKeySet<String>()
        val executor = Executors.newFixedThreadPool(32)
        val latch = CountDownLatch(254)
        val closed = AtomicBoolean(false)

        for (lastOctet in 1..254) {
            executor.execute {
                try {
                    if (!closed.get()) {
                        val host = "$prefix.$lastOctet"
                        if (host != ownHost && isTcpPortOpen(host, RAW_PRINT_PORT)) {
                            found.add(host)
                        }
                    }
                } finally {
                    latch.countDown()
                }
            }
        }

        latch.await(8, TimeUnit.SECONDS)
        closed.set(true)
        executor.shutdownNow()

        return found.sortedWith(compareBy { address ->
            address.substringAfterLast('.').toIntOrNull() ?: Int.MAX_VALUE
        }).map { host ->
            mapOf("host" to host, "port" to RAW_PRINT_PORT, "name" to "Stampante $host")
        }
    }

    private fun isTcpPortOpen(host: String, port: Int): Boolean = try {
        Socket().use { socket ->
            socket.connect(InetSocketAddress(host, port), WIFI_CONNECT_TIMEOUT_MS)
            true
        }
    } catch (_: Throwable) {
        false
    }

    private fun printText(call: MethodCall, result: MethodChannel.Result) {
        val transport = call.argument<String>("transport")
        val text = call.argument<String>("text") ?: ""
        val copies = call.argument<Int>("copies") ?: 1
        val supportsCut = call.argument<Boolean>("supportsCut") ?: false
        val encoding = call.argument<String>("encoding") ?: "CP858"
        if (copies !in 1..5) {
            result.error("INVALID_COPIES", "Il numero di copie deve essere compreso tra 1 e 5.", null)
            return
        }
        Thread {
            try {
                when (transport) {
                    "WIFI_TCP" -> {
                        val host = call.argument<String>("host")?.trim().orEmpty()
                        val port = call.argument<Int>("port") ?: RAW_PRINT_PORT
                        require(host.isNotEmpty()) { "Indirizzo della stampante Wi-Fi mancante." }
                        printTcp(host, port, text, copies, supportsCut, encoding)
                    }
                    "BLUETOOTH_CLASSIC" -> {
                        if (!hasBluetoothConnectPermission()) {
                            throw SecurityException("Autorizzazione Bluetooth non concessa.")
                        }
                        val address = call.argument<String>("address")?.trim().orEmpty()
                        require(address.isNotEmpty()) { "Indirizzo Bluetooth mancante." }
                        printBluetooth(address, text, copies, supportsCut, encoding)
                    }
                    else -> error("Trasporto di stampa non supportato.")
                }
                runOnUiThread { result.success(null) }
            } catch (error: Throwable) {
                val message = error.message ?: error.javaClass.simpleName
                runOnUiThread { result.error("LOCAL_PRINT_FAILED", message.take(500), null) }
            }
        }.start()
    }

    private fun printTcp(
        host: String,
        port: Int,
        text: String,
        copies: Int,
        supportsCut: Boolean,
        encoding: String,
    ) {
        require(port in 1..65535) { "Porta TCP non valida." }
        repeat(copies) {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(host, port), 8_000)
                socket.soTimeout = 8_000
                socket.getOutputStream().use { output ->
                    output.write(escPosPayload(text, supportsCut, encoding))
                    output.flush()
                }
            }
        }
    }

    private fun printBluetooth(
        address: String,
        text: String,
        copies: Int,
        supportsCut: Boolean,
        encoding: String,
    ) {
        val adapter = getSystemService(BluetoothManager::class.java)?.adapter
            ?: error("Bluetooth non disponibile sul dispositivo.")
        if (adapter.isDiscovering && hasBluetoothDiscoveryPermission()) {
            adapter.cancelDiscovery()
        }
        val device = adapter.getRemoteDevice(address)
        val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        socket.use {
            it.connect()
            val output = it.outputStream
            repeat(copies) {
                output.write(escPosPayload(text, supportsCut, encoding))
                output.flush()
            }
        }
    }

    private fun escPosPayload(
        text: String,
        supportsCut: Boolean,
        encoding: String,
    ): ByteArray {
        val charset = try {
            Charset.forName(encoding)
        } catch (_: Throwable) {
            Charsets.UTF_8
        }
        val body = (text.trimEnd() + "\n\n\n").toByteArray(charset)
        val initialize = byteArrayOf(0x1B, 0x40)
        val cut = if (supportsCut) byteArrayOf(0x1D, 0x56, 0x00) else byteArrayOf()
        return initialize + body + cut
    }

    private fun hasBluetoothConnectPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    private fun hasBluetoothDiscoveryPermission(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
        } else {
            checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
}
