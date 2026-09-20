#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEAdvertising.h>
#include "BeaconConfig.h"

// MVP: stable, nonconnectable iBeacon advertising only.
// Wi-Fi provisioning, MQTT, OTA and revocation will be implemented separately.
// A BLE identifier is PUBLIC, never use it for authentication.
static void makeManufacturerData(uint8_t (&out)[25]) {
  out[0] = 0x4c;  // Apple company identifier, little-endian
  out[1] = 0x00;
  out[2] = 0x02;  // iBeacon type
  out[3] = 0x15;  // iBeacon payload length (21)
  memcpy(out + 4, HVL_UUID, sizeof(HVL_UUID));
  out[20] = static_cast<uint8_t>(HVL_MAJOR >> 8);
  out[21] = static_cast<uint8_t>(HVL_MAJOR & 0xff);
  out[22] = static_cast<uint8_t>(HVL_MINOR >> 8);
  out[23] = static_cast<uint8_t>(HVL_MINOR & 0xff);
  out[24] = static_cast<uint8_t>(HVL_MEASURED_POWER);
}

void setup() {
  Serial.begin(115200);
  delay(250);
  BLEDevice::init("HVL-Info-Beacon");
  BLEServer *server = BLEDevice::createServer();
  BLEAdvertising *advertising = server->getAdvertising();

  uint8_t manufacturer[25];
  makeManufacturerData(manufacturer);
  BLEAdvertisementData data;
  data.setFlags(0x06);
  // Explicit length preserves the embedded 0x00 bytes in the UUID/payload.
  data.setManufacturerData(String(reinterpret_cast<const char *>(manufacturer), sizeof(manufacturer)));
  advertising->setAdvertisementData(data);
  advertising->start();
  Serial.printf("iBeacon started: Major=%u Minor=%u (test with nRF Connect)\n", HVL_MAJOR, HVL_MINOR);
}

void loop() {
  // BLE advertising continues in the ESP32 BLE stack.
  delay(10000);
}
