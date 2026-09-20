# ESP32-C3 SuperMini – iBeacon proof of concept

This folder holds an **actual BLE advertiser sketch**, not yet the Wi-Fi/MQTT managed firmware described in the project plan.

## First hardware test

1. Install Arduino-ESP32 **3.3.7** and select a board profile compatible with your ESP32-C3 SuperMini.
2. Copy `Beacon/BeaconConfig.example.h` to `Beacon/BeaconConfig.h`. The latter is ignored by Git; pick an identity assigned in your own test setup.
3. Upload `Beacon/Beacon.ino` via USB-C and power the board.
4. In **nRF Connect for Mobile**, inspect manufacturer data. The example should report company `0x004c`, UUID `00112233-4455-6677-8899-aabbccddeeff`, Major `100`, Minor `204`, measured power `-59`. Test the signal near and beyond your 3D-printed enclosure.
5. Compare the bytes with the shared TypeScript contract test in `packages/contracts/src/index.test.ts`; check the end-to-end detection in the actual HVL app once it exists.

The manufacturer-specific 25-byte example is:

```text
4c00021500112233445566778899aabbccddeeff006400ccc5
```

**Not yet implemented:** secure Wi-Fi setup, unique device credentials, RabbitMQ MQTT/TLS transport, remote config, heartbeat, OTA, install-confirmation app and real background monitoring. Never assume a registry disable stops a powered-offline unit; unplug/collect it during this first phase.

The UUID + Major + Minor are a public lookup key, not a secret or proof that the wearer is at a place. Do not use a random BLE MAC address as the stable device or place identity. Only install one physical transmitter per assigned iBeacon identity.

Upstream reference for iBeacon use of Arduino-ESP32 BLE: https://github.com/espressif/arduino-esp32/tree/master/libraries/BLE/examples/iBeacon
