# Firmware binaries

These binaries are built with PlatformIO and copied from `esp32c6-pio/.pio/build/<env>/firmware.bin`.

Files:
- `esp32devkitc-firmware.bin`
- `esp32-devkit-v1-firmware.bin`
- `esp32-wroom-32-firmware.bin`
- `esp32h2-firmware.bin`
- `esp32-wrover-firmware.bin`

If you need ESP32-H2 or WROVER, build with `pio run -e esp32h2` or `pio run -e esp32-wrover` and copy the new `firmware.bin` here.
