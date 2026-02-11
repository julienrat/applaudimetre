#include <Arduino.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <Adafruit_NeoPixel.h>

static const char* DEVICE_NAME = "Applaudimetre-ESP32";

// Nordic UART Service (NUS)
static const char* SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char* RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Score write from phone
static const char* CFG_CHAR_UUID = "6e400004-b5a3-f393-e0a9-e50e24dcca9e"; // Config read/write/notify
static NimBLEServer* gServer = nullptr;
static NimBLECharacteristic* gCfgChar = nullptr;
static Preferences gPrefs;
static Adafruit_NeoPixel* gStrip = nullptr;

struct AppConfig {
  uint16_t ledCount;
  uint8_t ledPin;
  uint8_t ledReverse;
};

static AppConfig gCfg = {30, 2, 0};

static void loadConfig() {
  gPrefs.begin("applcfg", true);
  gCfg.ledCount = gPrefs.getUShort("leds", gCfg.ledCount);
  gCfg.ledPin = gPrefs.getUChar("pin", gCfg.ledPin);
  gCfg.ledReverse = gPrefs.getUChar("rev", gCfg.ledReverse);
  gPrefs.end();
  if (gCfg.ledCount < 1) gCfg.ledCount = 1;
}

static void saveConfig() {
  gPrefs.begin("applcfg", false);
  gPrefs.putUShort("leds", gCfg.ledCount);
  gPrefs.putUChar("pin", gCfg.ledPin);
  gPrefs.putUChar("rev", gCfg.ledReverse);
  gPrefs.end();
}

static void initStrip() {
  if (gStrip) {
    gStrip->clear();
    gStrip->show();
    delete gStrip;
    gStrip = nullptr;
  }
  gStrip = new Adafruit_NeoPixel(gCfg.ledCount, gCfg.ledPin, NEO_GRB + NEO_KHZ800);
  gStrip->begin();
  gStrip->clear();
  gStrip->show();
}

static uint32_t colorFromScore(uint8_t score) {
  // Gradient: green -> yellow -> orange -> red
  uint8_t r = 0;
  uint8_t g = 0;
  if (score <= 50) {
    // green to yellow
    r = (uint8_t)map(score, 0, 50, 0, 255);
    g = 255;
  } else if (score <= 80) {
    // yellow to orange
    r = 255;
    g = (uint8_t)map(score, 50, 80, 255, 165);
  } else {
    // orange to red
    r = 255;
    g = (uint8_t)map(score, 80, 100, 165, 0);
  }
  return gStrip->Color(r, g, 0);
}

static void applyScore(uint8_t score) {
  if (!gStrip) return;
  uint16_t lit = (uint32_t)score * gCfg.ledCount / 100;
  uint32_t color = colorFromScore(score);
  for (uint16_t i = 0; i < gCfg.ledCount; i++) {
    uint16_t idx = gCfg.ledReverse ? (gCfg.ledCount - 1 - i) : i;
    gStrip->setPixelColor(idx, i < lit ? color : 0);
  }
  gStrip->show();
}

class RxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pCharacteristic, NimBLEConnInfo& connInfo) override {
    (void)connInfo;
    std::string val = pCharacteristic->getValue();
    if (val.empty()) return;

    // Expect 1 byte: 0-100
    uint8_t score = static_cast<uint8_t>(val[0]);
    Serial.print("Score recu: ");
    Serial.println(score);
    applyScore(score);
  }
};

class CfgCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pCharacteristic, NimBLEConnInfo& connInfo) override {
    (void)connInfo;
    std::string val = pCharacteristic->getValue();
    if (val.size() < 3) return;
    uint16_t leds = (uint16_t)((uint8_t)val[0] | ((uint8_t)val[1] << 8));
    uint8_t pin = (uint8_t)val[2];
    uint8_t rev = val.size() >= 4 ? (uint8_t)(val[3] & 0x01) : 0;
    if (leds < 1) leds = 1;
    gCfg.ledCount = leds;
    gCfg.ledPin = pin;
    gCfg.ledReverse = rev;
    saveConfig();
    initStrip();
    // Update characteristic value and notify
    uint8_t payload[4] = { (uint8_t)(gCfg.ledCount & 0xFF), (uint8_t)(gCfg.ledCount >> 8), gCfg.ledPin, gCfg.ledReverse };
    pCharacteristic->setValue(payload, sizeof(payload));
    pCharacteristic->notify();
    Serial.print("Config maj: leds=");
    Serial.print(gCfg.ledCount);
    Serial.print(" pin=");
    Serial.println(gCfg.ledPin);
  }
};

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo) override {
    (void)pServer;
    (void)connInfo;
    if (gCfgChar) {
      uint8_t payload[4] = { (uint8_t)(gCfg.ledCount & 0xFF), (uint8_t)(gCfg.ledCount >> 8), gCfg.ledPin, gCfg.ledReverse };
      gCfgChar->setValue(payload, sizeof(payload));
      gCfgChar->notify();
    }
  }
};

void setup() {
  Serial.begin(115200);
  delay(200);

  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9); // max power

  loadConfig();
  initStrip();

  gServer = NimBLEDevice::createServer();
  gServer->setCallbacks(new ServerCallbacks());
  NimBLEService* service = gServer->createService(SERVICE_UUID);

  NimBLECharacteristic* rxChar = service->createCharacteristic(
    RX_CHAR_UUID,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  rxChar->setCallbacks(new RxCallbacks());

  gCfgChar = service->createCharacteristic(
    CFG_CHAR_UUID,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::NOTIFY
  );
  gCfgChar->setCallbacks(new CfgCallbacks());
  uint8_t payload[4] = { (uint8_t)(gCfg.ledCount & 0xFF), (uint8_t)(gCfg.ledCount >> 8), gCfg.ledPin, gCfg.ledReverse };
  gCfgChar->setValue(payload, sizeof(payload));

  service->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData advData;
  advData.setName(DEVICE_NAME);
  adv->setAdvertisementData(advData);

  NimBLEAdvertisementData scanData;
  scanData.addServiceUUID(SERVICE_UUID);
  adv->setScanResponseData(scanData);

  adv->start();

  Serial.println("BLE pret, en attente de connexion...");
}

void loop() {
  // Keep advertising alive after client disconnects.
  if (gServer && gServer->getConnectedCount() == 0) {
    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    if (adv && !adv->isAdvertising()) {
      adv->start();
      Serial.println("Advertising relance apres deconnexion");
    }
  }
  delay(100);
}
