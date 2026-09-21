#pragma once
#include <stdint.h>

// Example ONLY. Allocate and register a real HVL Info UUID and Major/Minor
// in the backend; do not interpret these values as a room number.
constexpr uint8_t HVL_UUID[16] = {
  0x00,0x11,0x22,0x33,0x44,0x55,0x66,0x77,
  0x88,0x99,0xaa,0xbb,0xcc,0xdd,0xee,0xff
};
constexpr uint16_t HVL_MAJOR = 100;
constexpr uint16_t HVL_MINOR = 204;
// Placeholder. Calibrate with test hardware at 1 metre; not transmit power.
constexpr int8_t HVL_MEASURED_POWER = -59;
