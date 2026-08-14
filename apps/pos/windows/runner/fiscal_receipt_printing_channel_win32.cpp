#include "fiscal_receipt_printing_channel_win32.h"

#include <winsock2.h>
#include <ws2tcpip.h>
#include <ws2bth.h>
#include <windows.h>

#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <limits>
#include <memory>
#include <mutex>
#include <string>
#include <variant>
#include <vector>

namespace {

constexpr char kChannelName[] =
    "it.fluxa.fluxa_pos/fiscal_receipt_printing";
constexpr size_t kMaxPayloadBytes = 16U * 1024U * 1024U;
constexpr GUID kSerialPortServiceClassUuid = {
    0x00001101,
    0x0000,
    0x1000,
    {0x80, 0x00, 0x00, 0x80, 0x5F, 0x9B, 0x34, 0xFB},
};

struct OperationResult {
  bool ok = false;
  std::string error;
};

const flutter::EncodableValue* FindArgument(
    const flutter::EncodableMap* arguments,
    const char* key) {
  if (arguments == nullptr) {
    return nullptr;
  }
  const auto iterator = arguments->find(flutter::EncodableValue(key));
  return iterator == arguments->end() ? nullptr : &iterator->second;
}

bool ReadString(const flutter::EncodableMap* arguments,
                const char* key,
                std::string* output) {
  const flutter::EncodableValue* value = FindArgument(arguments, key);
  const auto* text =
      value == nullptr ? nullptr : std::get_if<std::string>(value);
  if (text == nullptr || output == nullptr) {
    return false;
  }
  *output = *text;
  return true;
}

bool ReadInt(const flutter::EncodableMap* arguments,
             const char* key,
             int* output) {
  const flutter::EncodableValue* value = FindArgument(arguments, key);
  if (value == nullptr || output == nullptr) {
    return false;
  }
  if (const auto* int32 = std::get_if<int32_t>(value); int32 != nullptr) {
    *output = *int32;
    return true;
  }
  if (const auto* int64 = std::get_if<int64_t>(value); int64 != nullptr) {
    if (*int64 < std::numeric_limits<int>::min() ||
        *int64 > std::numeric_limits<int>::max()) {
      return false;
    }
    *output = static_cast<int>(*int64);
    return true;
  }
  return false;
}

bool ReadBytes(const flutter::EncodableMap* arguments,
               const char* key,
               std::vector<uint8_t>* output) {
  const flutter::EncodableValue* value = FindArgument(arguments, key);
  const auto* bytes =
      value == nullptr ? nullptr : std::get_if<std::vector<uint8_t>>(value);
  if (bytes == nullptr || output == nullptr) {
    return false;
  }
  *output = *bytes;
  return true;
}

bool EnsureWinsock(std::string* error) {
  static std::once_flag once;
  static int startup_result = WSASYSNOTREADY;
  std::call_once(once, []() {
    WSADATA data{};
    startup_result = WSAStartup(MAKEWORD(2, 2), &data);
  });
  if (startup_result == 0) {
    return true;
  }
  if (error != nullptr) {
    *error = "Impossibile inizializzare Winsock: " +
             std::to_string(startup_result) + ".";
  }
  return false;
}

bool ParseBluetoothAddress(const std::string& value, BTH_ADDR* address) {
  if (address == nullptr) {
    return false;
  }
  std::array<unsigned int, 6> bytes{};
  const int matched = sscanf_s(
      value.c_str(), "%2x:%2x:%2x:%2x:%2x:%2x", &bytes[0], &bytes[1],
      &bytes[2], &bytes[3], &bytes[4], &bytes[5]);
  if (matched != 6 ||
      std::any_of(bytes.begin(), bytes.end(),
                  [](unsigned int byte) { return byte > 0xFFU; })) {
    return false;
  }
  BTH_ADDR parsed = 0;
  for (const unsigned int byte : bytes) {
    parsed = (parsed << 8) | static_cast<BTH_ADDR>(byte);
  }
  *address = parsed;
  return true;
}

bool SendAll(SOCKET socket,
             const std::vector<uint8_t>& payload,
             std::string* error) {
  size_t offset = 0;
  while (offset < payload.size()) {
    const size_t remaining = payload.size() - offset;
    const size_t chunk_size =
        std::min(remaining,
                 static_cast<size_t>(std::numeric_limits<int>::max()));
    const int sent = send(
        socket, reinterpret_cast<const char*>(payload.data() + offset),
        static_cast<int>(chunk_size), 0);
    if (sent == SOCKET_ERROR || sent <= 0) {
      if (error != nullptr) {
        *error = "Invio alla stampante fallito: " +
                 std::to_string(WSAGetLastError()) + ".";
      }
      return false;
    }
    offset += static_cast<size_t>(sent);
  }
  return true;
}

SOCKET ConnectTcp(const std::string& host,
                  int port,
                  std::string* error) {
  std::string winsock_error;
  if (!EnsureWinsock(&winsock_error)) {
    if (error != nullptr) {
      *error = winsock_error;
    }
    return INVALID_SOCKET;
  }

  addrinfo hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_protocol = IPPROTO_TCP;

  addrinfo* addresses = nullptr;
  const std::string service = std::to_string(port);
  const int lookup =
      getaddrinfo(host.c_str(), service.c_str(), &hints, &addresses);
  if (lookup != 0) {
    if (error != nullptr) {
      *error = "Hostname stampante non risolto: " +
               std::to_string(lookup) + ".";
    }
    return INVALID_SOCKET;
  }

  SOCKET connected = INVALID_SOCKET;
  for (addrinfo* current = addresses; current != nullptr;
       current = current->ai_next) {
    SOCKET candidate = socket(current->ai_family, current->ai_socktype,
                              current->ai_protocol);
    if (candidate == INVALID_SOCKET) {
      continue;
    }

    u_long non_blocking = 1;
    if (ioctlsocket(candidate, FIONBIO, &non_blocking) == SOCKET_ERROR) {
      closesocket(candidate);
      continue;
    }

    const int connect_result =
        connect(candidate, current->ai_addr,
                static_cast<int>(current->ai_addrlen));
    bool ready = connect_result == 0;
    if (!ready && WSAGetLastError() == WSAEWOULDBLOCK) {
      fd_set writable;
      fd_set failed;
      FD_ZERO(&writable);
      FD_ZERO(&failed);
      FD_SET(candidate, &writable);
      FD_SET(candidate, &failed);
      timeval timeout{};
      timeout.tv_sec = 5;
      timeout.tv_usec = 0;
      const int selected =
          select(0, nullptr, &writable, &failed, &timeout);
      if (selected > 0 && FD_ISSET(candidate, &writable) &&
          !FD_ISSET(candidate, &failed)) {
        int socket_error = 0;
        int length = sizeof(socket_error);
        if (getsockopt(candidate, SOL_SOCKET, SO_ERROR,
                       reinterpret_cast<char*>(&socket_error), &length) == 0 &&
            socket_error == 0) {
          ready = true;
        }
      }
    }

    non_blocking = 0;
    if (ioctlsocket(candidate, FIONBIO, &non_blocking) == SOCKET_ERROR) {
      ready = false;
    }

    if (ready) {
      const DWORD send_timeout_ms = 10000;
      setsockopt(candidate, SOL_SOCKET, SO_SNDTIMEO,
                 reinterpret_cast<const char*>(&send_timeout_ms),
                 sizeof(send_timeout_ms));
      connected = candidate;
      break;
    }
    closesocket(candidate);
  }

  freeaddrinfo(addresses);
  if (connected == INVALID_SOCKET && error != nullptr) {
    *error = "Connessione TCP alla stampante non riuscita.";
  }
  return connected;
}

SOCKET ConnectBluetooth(const std::string& address_text,
                        std::string* error) {
  std::string winsock_error;
  if (!EnsureWinsock(&winsock_error)) {
    if (error != nullptr) {
      *error = winsock_error;
    }
    return INVALID_SOCKET;
  }

  BTH_ADDR address = 0;
  if (!ParseBluetoothAddress(address_text, &address)) {
    if (error != nullptr) {
      *error = "Indirizzo Bluetooth non valido.";
    }
    return INVALID_SOCKET;
  }

  SOCKET socket_handle = socket(AF_BTH, SOCK_STREAM, BTHPROTO_RFCOMM);
  if (socket_handle == INVALID_SOCKET) {
    if (error != nullptr) {
      *error = "Bluetooth RFCOMM non disponibile: " +
               std::to_string(WSAGetLastError()) + ".";
    }
    return INVALID_SOCKET;
  }

  SOCKADDR_BTH target{};
  target.addressFamily = AF_BTH;
  target.btAddr = address;
  target.serviceClassId = kSerialPortServiceClassUuid;
  target.port = BT_PORT_ANY;

  if (connect(socket_handle, reinterpret_cast<SOCKADDR*>(&target),
              sizeof(target)) == SOCKET_ERROR) {
    if (error != nullptr) {
      *error = "Connessione Bluetooth SPP fallita: " +
               std::to_string(WSAGetLastError()) + ".";
    }
    closesocket(socket_handle);
    return INVALID_SOCKET;
  }
  return socket_handle;
}

OperationResult PrintTcp(const std::string& host,
                         int port,
                         const std::vector<uint8_t>& payload,
                         int copies) {
  for (int copy = 0; copy < copies; copy += 1) {
    std::string error;
    SOCKET socket_handle = ConnectTcp(host, port, &error);
    if (socket_handle == INVALID_SOCKET) {
      return {false, error};
    }
    const bool sent = SendAll(socket_handle, payload, &error);
    shutdown(socket_handle, SD_SEND);
    closesocket(socket_handle);
    if (!sent) {
      return {false, error};
    }
  }
  return {true, {}};
}

OperationResult PrintBluetooth(const std::string& address,
                               const std::vector<uint8_t>& payload,
                               int copies) {
  std::string error;
  SOCKET socket_handle = ConnectBluetooth(address, &error);
  if (socket_handle == INVALID_SOCKET) {
    return {false, error};
  }
  for (int copy = 0; copy < copies; copy += 1) {
    if (!SendAll(socket_handle, payload, &error)) {
      closesocket(socket_handle);
      return {false, error};
    }
  }
  shutdown(socket_handle, SD_SEND);
  closesocket(socket_handle);
  return {true, {}};
}

OperationResult HandlePrintRaw(const flutter::EncodableMap* arguments) {
  std::string transport;
  std::vector<uint8_t> payload;
  int copies = 1;

  if (!ReadString(arguments, "transport", &transport) ||
      !ReadBytes(arguments, "bytes", &payload)) {
    return {false, "Parametri di stampa fiscale mancanti."};
  }
  ReadInt(arguments, "copies", &copies);
  if (copies < 1 || copies > 3) {
    return {false, "Il numero di copie deve essere compreso tra 1 e 3."};
  }
  if (payload.empty() || payload.size() > kMaxPayloadBytes) {
    return {false, "Payload raster fiscale non valido."};
  }

  if (transport == "WIFI_TCP") {
    std::string host;
    int port = 9100;
    if (!ReadString(arguments, "host", &host) || host.empty() ||
        !ReadInt(arguments, "port", &port) || port < 1 || port > 65535) {
      return {false, "Configurazione Wi-Fi non valida."};
    }
    return PrintTcp(host, port, payload, copies);
  }

  if (transport == "BLUETOOTH_CLASSIC") {
    std::string address;
    if (!ReadString(arguments, "address", &address) || address.empty()) {
      return {false, "Indirizzo Bluetooth mancante."};
    }
    return PrintBluetooth(address, payload, copies);
  }

  return {false, "Trasporto di stampa non supportato."};
}

}  // namespace

void RegisterFiscalReceiptPrintingChannel(flutter::BinaryMessenger* messenger) {
  if (messenger == nullptr) {
    return;
  }

  auto channel = std::make_unique<flutter::MethodChannel<>>(
      messenger, kChannelName, &flutter::StandardMethodCodec::GetInstance());
  channel->SetMethodCallHandler(
      [](const flutter::MethodCall<>& call,
         std::unique_ptr<flutter::MethodResult<>> result) {
        if (call.method_name() != "printRaw") {
          result->NotImplemented();
          return;
        }
        const auto* arguments =
            call.arguments() == nullptr
                ? nullptr
                : std::get_if<flutter::EncodableMap>(call.arguments());
        const OperationResult print_result = HandlePrintRaw(arguments);
        if (print_result.ok) {
          result->Success();
        } else {
          result->Error("FISCAL_RECEIPT_PRINT_FAILED", print_result.error);
        }
      });
  channel.release();
}
