#pragma once

namespace flutter {
class BinaryMessenger;
}

void RegisterPrintingChannel(flutter::BinaryMessenger* messenger);
