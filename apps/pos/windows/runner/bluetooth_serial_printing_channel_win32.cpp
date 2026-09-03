#include "bluetooth_serial_printing_channel_win32.h"

#include <windows.h>
#include <setupapi.h>

#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cwctype>
#include <limits>
#include <string>
#include <variant>
#include <vector>

namespace {

constexpr char kChannelName[] =
    "it.fluxa.fluxa_pos/bluetooth_serial_printing";

struct OperationResult {
  bool ok = false;
  std::string error;
};

std::string WideToUtf8(const std::wstring& value) {
  if (value.empty()) {
    return {};
  }
  if (value.size() > static_cast<size_t>(std::numeric_limits<int>::max())) {
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

std::wstring ReadDeviceProperty(HDEVINFO devices,
                                SP_DEVINFO_DATA* info,
                                DWORD property) {
  if (devices == INVALID_HANDLE_VALUE || info == nullptr) {
    return {};
  }
  wchar_t buffer[1024]{};
  DWORD data_type = 0;
  DWORD required_size = 0;
  if (!SetupDiGetDeviceRegistryPropertyW(
          devices, info, property, &data_type,
          reinterpret_cast<PBYTE>(buffer), sizeof(buffer), &required_size)) {
    return {};
  }
  if (data_type != REG_SZ && data_type != REG_EXPAND_SZ &&
      data_type != REG_MULTI_SZ) {
    return {};
  }
  return std::wstring(buffer);
}

std::wstring ReadDeviceInstanceId(HDEVINFO devices, SP_DEVINFO_DATA* info) {
  if (devices == INVALID_HANDLE_VALUE || info == nullptr) {
    return {};
  }
  wchar_t buffer[1024]{};
  DWORD required_size = 0;
  if (!SetupDiGetDeviceInstanceIdW(devices, info, buffer,
                                   static_cast<DWORD>(std::size(buffer)),
                                   &required_size)) {
    return {};
  }
  return std::wstring(buffer);
}

std::wstring ReadPortName(HDEVINFO devices, SP_DEVINFO_DATA* info) {
  if (devices == INVALID_HANDLE_VALUE || info == nullptr) {
    return {};
  }
  HKEY key = SetupDiOpenDevRegKey(devices, info, DICS_FLAG_GLOBAL, 0,
                                  DIREG_DEV, KEY_QUERY_VALUE);
  if (key == INVALID_HANDLE_VALUE) {
    return {};
  }

  wchar_t buffer[128]{};
  DWORD data_type = 0;
  DWORD size = sizeof(buffer);
  const LONG status = RegQueryValueExW(
      key, L"PortName", nullptr, &data_type,
      reinterpret_cast<LPBYTE>(buffer), &size);
  RegCloseKey(key);
  if (status != ERROR_SUCCESS ||
      (data_type != REG_SZ && data_type != REG_EXPAND_SZ)) {
    return {};
  }
  return std::wstring(buffer);
}

std::wstring ToUpper(std::wstring value) {
  std::transform(value.begin(), value.end(), value.begin(),
                 [](wchar_t character) {
                   return static_cast<wchar_t>(std::towupper(character));
                 });
  return value;
}

bool IsBluetoothPortInstance(const std::wstring& instance_id) {
  const std::wstring normalized = ToUpper(instance_id);
  return normalized.rfind(L"BTHENUM\\", 0) == 0 ||
         normalized.rfind(L"BTHMODEM\\", 0) == 0;
}

bool IsComPortName(const std::wstring& value) {
  const std::wstring normalized = ToUpper(value);
  if (normalized.size() < 4 || normalized.rfind(L"COM", 0) != 0) {
    return false;
  }
  return std::all_of(normalized.begin() + 3, normalized.end(),
                     [](wchar_t character) {
                       return character >= L'0' && character <= L'9';
                     });
}

int ComPortNumber(const std::wstring& port) {
  if (!IsComPortName(port)) {
    return std::numeric_limits<int>::max();
  }
  try {
    return std::stoi(port.substr(3));
  } catch (...) {
    return std::numeric_limits<int>::max();
  }
}

std::wstring StripComSuffix(std::wstring name, const std::wstring& port) {
  if (name.empty() || port.empty()) {
    return name;
  }
  const std::wstring suffix = L" (" + port + L")";
  const std::wstring upper_name = ToUpper(name);
  const std::wstring upper_suffix = ToUpper(suffix);
  if (upper_name.size() >= upper_suffix.size() &&
      upper_name.compare(upper_name.size() - upper_suffix.size(),
                         upper_suffix.size(), upper_suffix) == 0) {
    name.erase(name.size() - suffix.size());
  }
  return name;
}

flutter::EncodableList ListBluetoothSerialPrinters() {
  flutter::EncodableList result;
  HDEVINFO devices = SetupDiGetClassDevsW(
      &GUID_DEVCLASS_PORTS, nullptr, nullptr, DIGCF_PRESENT);
  if (devices == INVALID_HANDLE_VALUE) {
    return result;
  }

  struct SerialPort {
    std::wstring port;
    std::wstring name;
  };
  std::vector<SerialPort> ports;

  for (DWORD index = 0;; index += 1) {
    SP_DEVINFO_DATA info{};
    info.cbSize = sizeof(info);
    if (!SetupDiEnumDeviceInfo(devices, index, &info)) {
      if (GetLastError() == ERROR_NO_MORE_ITEMS) {
        break;
      }
      continue;
    }

    const std::wstring instance_id = ReadDeviceInstanceId(devices, &info);
    if (!IsBluetoothPortInstance(instance_id)) {
      continue;
    }

    const std::wstring port = ToUpper(ReadPortName(devices, &info));
    if (!IsComPortName(port)) {
      continue;
    }

    std::wstring name = ReadDeviceProperty(devices, &info, SPDRP_FRIENDLYNAME);
    if (name.empty()) {
      name = ReadDeviceProperty(devices, &info, SPDRP_DEVICEDESC);
    }
    name = StripComSuffix(name, port);
    if (name.empty()) {
      name = L"Stampante Bluetooth seriale";
    }

    const auto duplicate = std::find_if(
        ports.begin(), ports.end(), [&](const SerialPort& existing) {
          return ToUpper(existing.port) == port;
        });
    if (duplicate == ports.end()) {
      ports.push_back({port, name});
    }
  }

  SetupDiDestroyDeviceInfoList(devices);

  std::sort(ports.begin(), ports.end(),
            [](const SerialPort& left, const SerialPort& right) {
              return ComPortNumber(left.port) < ComPortNumber(right.port);
            });

  for (const SerialPort& serial_port : ports) {
    flutter::EncodableMap item;
    item[flutter::EncodableValue("port")] =
        flutter::EncodableValue(WideToUtf8(serial_port.port));
    item[flutter::EncodableValue("name")] =
        flutter::EncodableValue(WideToUtf8(serial_port.name));
    result.emplace_back(item);
  }
  return result;
}

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
  const auto* text = value == nullptr ? nullptr : std::get_if<std::string>(value);
  if (text == nullptr || output == nullptr) {
    return false;
  }
  *output = *text;
  return true;
}

bool ReadBool(const flutter::EncodableMap* arguments,
              const char* key,
              bool* output) {
  const flutter::EncodableValue* value = FindArgument(arguments, key);
  const auto* boolean = value == nullptr ? nullptr : std::get_if<bool>(value);
  if (boolean == nullptr || output == nullptr) {
    return false;
  }
  *output = *boolean;
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

std::vector<uint8_t> EncodeToCodePage(const std::string& input,
                                      UINT code_page) {
  if (input.empty()) {
    return {};
  }
  if (input.size() > static_cast<size_t>(std::numeric_limits<int>::max())) {
    return {};
  }

  const int input_length = static_cast<int>(input.size());
  const int wide_length = MultiByteToWideChar(
      CP_UTF8, MB_ERR_INVALID_CHARS, input.data(), input_length, nullptr, 0);
  if (wide_length <= 0) {
    return std::vector<uint8_t>(input.begin(), input.end());
  }

  std::wstring wide(static_cast<size_t>(wide_length), L'\0');
  if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, input.data(),
                          input_length, wide.data(), wide_length) <= 0) {
    return std::vector<uint8_t>(input.begin(), input.end());
  }

  const int encoded_length = WideCharToMultiByte(
      code_page, 0, wide.data(), wide_length, nullptr, 0, "?", nullptr);
  if (encoded_length <= 0) {
    return std::vector<uint8_t>(input.begin(), input.end());
  }

  std::vector<uint8_t> encoded(static_cast<size_t>(encoded_length));
  if (WideCharToMultiByte(
          code_page, 0, wide.data(), wide_length,
          reinterpret_cast<char*>(encoded.data()), encoded_length, "?",
          nullptr) <= 0) {
    return std::vector<uint8_t>(input.begin(), input.end());
  }
  return encoded;
}

std::vector<uint8_t> BuildEscPosPayload(const std::string& text,
                                        bool supports_cut,
                                        const std::string& encoding) {
  UINT code_page = 858;
  if (encoding == "CP850" || encoding == "IBM850") {
    code_page = 850;
  }

  std::vector<uint8_t> body = EncodeToCodePage(text, code_page);
  if (body.empty() && !text.empty() && code_page != 850) {
    body = EncodeToCodePage(text, 850);
  }

  std::vector<uint8_t> payload;
  payload.reserve(body.size() + 10U);
  payload.push_back(0x1B);
  payload.push_back(0x40);
  payload.insert(payload.end(), body.begin(), body.end());
  payload.push_back('\n');
  payload.push_back('\n');
  payload.push_back('\n');
  if (supports_cut) {
    payload.push_back(0x1D);
    payload.push_back(0x56);
    payload.push_back(0x00);
  }
  return payload;
}

bool NormalizePortName(const std::string& input, std::wstring* output) {
  if (output == nullptr) {
    return false;
  }
  std::string normalized = input;
  normalized.erase(normalized.begin(),
                   std::find_if(normalized.begin(), normalized.end(),
                                [](unsigned char character) {
                                  return !std::isspace(character);
                                }));
  normalized.erase(
      std::find_if(normalized.rbegin(), normalized.rend(),
                   [](unsigned char character) {
                     return !std::isspace(character);
                   })
          .base(),
      normalized.end());
  std::transform(normalized.begin(), normalized.end(), normalized.begin(),
                 [](unsigned char character) {
                   return static_cast<char>(std::toupper(character));
                 });
  if (normalized.size() < 4 || normalized.rfind("COM", 0) != 0 ||
      !std::all_of(normalized.begin() + 3, normalized.end(),
                   [](unsigned char character) {
                     return std::isdigit(character) != 0;
                   })) {
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
  timeouts.ReadTotalTimeoutMultiplier = 0;
  timeouts.ReadTotalTimeoutConstant = 0;
  timeouts.WriteTotalTimeoutMultiplier = 20;
  timeouts.WriteTotalTimeoutConstant = 5000;
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
        *error = "Invio alla stampante seriale fallito: errore " +
                 std::to_string(GetLastError()) + ".";
      }
      return false;
    }
    offset += static_cast<size_t>(written);
  }
  return true;
}

OperationResult PrintSerial(const std::string& port,
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

OperationResult HandlePrint(const flutter::EncodableMap* arguments) {
  std::string port;
  std::string text;
  std::string encoding = "CP858";
  int copies = 1;
  bool supports_cut = false;

  if (!ReadString(arguments, "port", &port) || port.empty() ||
      !ReadString(arguments, "text", &text)) {
    return {false, "Parametri di stampa seriale mancanti."};
  }
  ReadString(arguments, "encoding", &encoding);
  ReadInt(arguments, "copies", &copies);
  ReadBool(arguments, "supportsCut", &supports_cut);
  if (copies < 1 || copies > 5) {
    return {false, "Il numero di copie deve essere compreso tra 1 e 5."};
  }

  const std::vector<uint8_t> payload =
      BuildEscPosPayload(text, supports_cut, encoding);
  return PrintSerial(port, payload, copies);
}

}  // namespace

void RegisterBluetoothSerialPrintingChannel(flutter::BinaryMessenger* messenger) {
  if (messenger == nullptr) {
    return;
  }

  auto channel = std::make_unique<flutter::MethodChannel<>>(
      messenger, kChannelName, &flutter::StandardMethodCodec::GetInstance());
  channel->SetMethodCallHandler(
      [](const flutter::MethodCall<>& call,
         std::unique_ptr<flutter::MethodResult<>> result) {
        if (call.method_name() == "listBluetoothSerialPrinters") {
          result->Success(
              flutter::EncodableValue(ListBluetoothSerialPrinters()));
          return;
        }

        if (call.method_name() == "printText") {
          const auto* arguments =
              call.arguments() == nullptr
                  ? nullptr
                  : std::get_if<flutter::EncodableMap>(call.arguments());
          const OperationResult print_result = HandlePrint(arguments);
          if (print_result.ok) {
            result->Success();
          } else {
            result->Error("LOCAL_PRINT_FAILED", print_result.error);
          }
          return;
        }

        result->NotImplemented();
      });
  channel.release();
}
