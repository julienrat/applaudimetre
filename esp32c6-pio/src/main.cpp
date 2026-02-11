#include <Arduino.h>
#include <NimBLEDevice.h>

static const char* DEVICE_NAME = "Applaudimetre-ESP32C6";

// Nordic UART Service (NUS)
static const char* SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char* RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Write from phone

class RxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pCharacteristic, NimBLEConnInfo& connInfo) override {
    (void)connInfo;
    std::string val = pCharacteristic->getValue();
    if (val.empty()) return;

    // Expect 1 byte: 0-100
    uint8_t score = static_cast<uint8_t>(val[0]);
    Serial.print("Score recu: ");
    Serial.println(score);
  }
};

void setup() {
  Serial.begin(115200);
  delay(200);

  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9); // max power

  NimBLEServer* server = NimBLEDevice::createServer();
  NimBLEService* service = server->createService(SERVICE_UUID);

  NimBLECharacteristic* rxChar = service->createCharacteristic(
    RX_CHAR_UUID,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  rxChar->setCallbacks(new RxCallbacks());

  service->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->start();

  Serial.println("BLE pret, en attente de connexion...");
}

void loop() {
  delay(100);
}
