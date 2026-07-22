package it.fluxa.fluxa_pos

import android.Manifest
import android.bluetooth.BluetoothManager
import android.content.pm.PackageManager
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.Charset
import java.util.UUID

class MainActivity : FlutterActivity() {
    companion object {
        private const val CHANNEL = "it.fluxa.fluxa_pos/printing"
        private const val BLUETOOTH_PERMISSION_REQUEST = 7107
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }

    private var pendingBluetoothPermissionResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "ensureBluetoothPermission" -> ensureBluetoothPermission(result)
                    "listPairedBluetoothPrinters" -> listPairedBluetoothPrinters(result)
                    "printText" -> printText(call, result)
                    else -> result.notImplemented()
                }
            }
    }

    private fun ensureBluetoothPermission(result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        ) {
            result.success(true)
            return
        }
        if (pendingBluetoothPermissionResult != null) {
            result.error("BLUETOOTH_PERMISSION_PENDING", "Richiesta Bluetooth già in corso.", null)
            return
        }
        pendingBluetoothPermissionResult = result
        requestPermissions(
            arrayOf(Manifest.permission.BLUETOOTH_CONNECT),
            BLUETOOTH_PERMISSION_REQUEST,
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == BLUETOOTH_PERMISSION_REQUEST) {
            val granted = grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED
            pendingBluetoothPermissionResult?.success(granted)
            pendingBluetoothPermissionResult = null
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
            val devices = adapter.bondedDevices
                .map { device ->
                    mapOf(
                        "address" to device.address,
                        "name" to (device.name ?: device.address),
                    )
                }
                .sortedBy { it["name"]?.lowercase() }
            result.success(devices)
        } catch (error: SecurityException) {
            result.error("BLUETOOTH_PERMISSION_REQUIRED", error.message, null)
        }
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
                        val port = call.argument<Int>("port") ?: 9100
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
                runOnUiThread {
                    result.error("LOCAL_PRINT_FAILED", message.take(500), null)
                }
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
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED
}
