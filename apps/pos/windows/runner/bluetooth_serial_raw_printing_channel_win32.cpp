#include "bluetooth_serial_raw_printing_channel_win32.h"

#include <windows.h>

#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <limits>
#include <string>
#include <variant>
#include <vector>

namespace {

constexpr char kChannelName[] =
    "it.fluxa.fluxa_pos/bluetooth_serial_raw_printing";
constexpr size_t kMaxPayloadBytes = 16U * 1024U * 1024U;

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

bool NormalizePortName(const std::string& input, std::wstring* output) {
  if (output == nullptr) {
    return false;
  }

  std::string normalized = input;
  normalized.erase(
      normalized.begin(),
      std::find_if(normalized.begin(), normalized.end(), [](unsigned char c) {
        return !std::isspace(c);
      }));
  normalized.erase(
      std::find_if(normalized.rbegin(), normalized.rend(), [](unsigned char c) {
        return !std::isspace(c);
      }).base(),
      normalized.end());
  std::transform(normalized.begin(), normalized.end(), normalized.begin(),
                 [](unsigned char c) {
                   return static_cast<char>(std::toupper(c));
                 });

  if (normalized.size() < 4 || normalized.rfind("COM", 0) != 0 ||
      !std::all_of(normalized.begin() + 3, normalized.end(),
                   [](unsigned char c) { return std::isdigit(c) != 0; })) {
    return false;
  }

  int number = 0;
  try {
    number = std::stoi(normalized.substr(3));
  } catch (...) {
    return false;
  }
  if (number < 1 || number > 4096) {
    return false;
  }

  output->assign(normalized.begin(), normalized.end());
  return true;
}

std::string WideToUtf8(const std::wstring& value) {
  if (value.empty() ||
      value.size() > static_cast<size_t>(std::numeric_limits<int>::max())) {
    return {};
  }
  const int length = static_cast<int>(value.size());
  const int output_length = WideCharToMultiByte(
      CP_UTF8, 0, value.data(), length, nullptr, 0, nullptr, nullptr);
  if (output_length <= 0) {
    return {};
  }
  std::string output(static_cast<size_t>(output_length), '\0');
  if (WideCharToMultiByte(CP_UTF8, 0, value.data(), length, output.data(),
                          output_length, nullptr, nullptr) <= 0) {
    return {};
  }
  return output;
}

HANDLE OpenSerialPort(const std::string& port_text, std::string* error) {
  std::wstring port;
  if (!NormalizePortName(port_text, &port)) {
    if (error != nullptr) {
      *error = "Porta seriale Bluetooth non valida.";
    }
    return INVALID_HANDLE_VALUE;
  }

  const std::wstring path = L"\\\\.\\" + port;
  HANDLE handle = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, 0,
                              nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL,
                              nullptr);
  if (handle == INVALID_HANDLE_VALUE) {
    if (error != nullptr) {
      *error = "Impossibile aprire " + WideToUtf8(port) + ": errore " +
               std::to_string(GetLastError()) + ".";
    }
    return INVALID_HANDLE_VALUE;
  }

  DCB state{};
  state.DCBlength = sizeof(state);
  if (!GetCommState(handle, &state)) {
    if (error != nullptr) {
      *error = "Impossibile leggere la configurazione di " +
               WideToUtf8(port) + ": errore " +
               std::to_string(GetLastError()) + ".";
    }
    CloseHandle(handle);
    return INVALID_HANDLE_VALUE;
  }

  if (state.BaudRate == 0) {
    state.BaudRate = CBR_9600;
  }
  state.ByteSize = 8;
  state.Parity = NOPARITY;
  state.StopBits = ONESTOPBIT;
  state.fBinary = TRUE;
  state.fParity = FALSE;
  state.fOutxCtsFlow = FALSE;
  state.fOutxDsrFlow = FALSE;
  state.fOutX = FALSE;
  state.fInX = FALSE;
  state.fAbortOnError = FALSE;

  if (!SetCommState(handle, &state)) {
    if (error != nullptr) {
      *error = "Impossibile configurare " + WideToUtf8(port) +
               ": errore " + std::to_string(GetLastError()) + ".";
    }
    CloseHandle(handle);
    return INVALID_HANDLE_VALUE;
  }

  COMMTIMEOUTS timeouts{};
  timeouts.ReadIntervalTimeout = MAXDWORD;
  timeouts.WriteTotalTimeoutMultiplier = 20;
  timeouts.WriteTotalTimeoutConstant = 10000;
  if (!SetCommTimeouts(handle, &timeouts)) {
    if (error != nullptr) {
      *error = "Impossibile impostare i timeout di " + WideToUtf8(port) +
               ": errore " + std::to_string(GetLastError()) + ".";
    }
    CloseHandle(handle);
    return INVALID_HANDLE_VALUE;
  }

  PurgeComm(handle, PURGE_TXABORT | PURGE_TXCLEAR);
  return handle;
}

bool WriteAll(HANDLE handle,
              const std::vector<uint8_t>& payload,
              std::string* error) {
  size_t offset = 0;
  while (offset < payload.size()) {
    const size_t remaining = payload.size() - offset;
    const DWORD chunk_size = static_cast<DWORD>(std::min(
        remaining, static_cast<size_t>(std::numeric_limits<DWORD>::max())));
    DWORD written = 0;
    if (!WriteFile(handle, payload.data() + offset, chunk_size, &written,
                   nullptr) ||
        written == 0) {
      if (error != nullptr) {
        *error = "Invio raster alla stampante seriale fallito: errore " +
                 std::to_string(GetLastError()) + ".";
      }
      return false;
    }
    offset += static_cast<size_t>(written);
  }
  return true;
}

OperationResult PrintRaw(const std::string& port,
                         const std::vector<uint8_t>& payload,
                         int copies) {
  std::string error;
  HANDLE handle = OpenSerialPort(port, &error);
  if (handle == INVALID_HANDLE_VALUE) {
    return {false, error};
  }

  for (int copy = 0; copy < copies; copy += 1) {
    if (!WriteAll(handle, payload, &error)) {
      CloseHandle(handle);
      return {false, error};
    }
  }

  if (!FlushFileBuffers(handle)) {
    const DWORD flush_error = GetLastError();
    CloseHandle(handle);
    return {false, "Flush della porta seriale fallito: errore " +
                       std::to_string(flush_error) + "."};
  }

  CloseHandle(handle);
  return {true, {}};
}

OperationResult HandlePrintRaw(const flutter::EncodableMap* arguments) {
  std::string port;
  std::vector<uint8_t> payload;
  int copies = 1;

  if (!ReadString(arguments, "port", &port) || port.empty() ||
      !ReadBytes(arguments, "bytes", &payload)) {
    return {false, "Parametri di stampa fiscale seriale mancanti."};
  }
  ReadInt(arguments, "copies", &copies);
  if (copies < 1 || copies > 3) {
    return {false, "Il numero di copie deve essere compreso tra 1 e 3."};
  }
  if (payload.empty() || payload.size() > kMaxPayloadBytes) {
    return {false, "Payload raster fiscale non valido."};
  }

  return PrintRaw(port, payload, copies);
}

}  // namespace

void RegisterBluetoothSerialRawPrintingChannel(
    flutter::BinaryMessenger* messenger) {
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
