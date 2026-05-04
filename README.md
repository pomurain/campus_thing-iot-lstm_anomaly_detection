# IoT Integrated with LSTM Anomaly Detection
Designed to be run on a Raspberry Pi

## How to use
- If you haven't installed requirements.txt, you can run run.sh. It will automatically install dependencies
- There is a unified endpoint to POST data to from your ESP32: `/api/data`
  - For temperature anomaly tracking, send: `{"type": "temp", "device_id": "...", "t_dht": 32.1, "t_bmp": 31.0}`
  - For raw gas tracking, send: `{"type": "gas", "device_id": "...", "gas_raw": 150.1, "gas_lpg": 15.0, "gas_co": 2.0}`

## Database Schema

The database uses SQLite (`iot_data.db`) and contains two tables: `sensor_data` (for temp anomalies) and `gas_data` (for raw gas tracking).

**`sensor_data` (Temp/Anomaly Table):**
- `id`: Auto-incrementing primary key.
- `device_id`: A string identifier for the microcontroller.
- `created_at`: The timestamp when the data was received by the server.
- `t_dht`: Temperature reading from DHT sensor.
- `t_bmp`: Temperature reading from BMP sensor.
- `is_anomaly`: Boolean indicating if the model flagged this reading as an anomaly.

**`gas_data` (Raw Gas Table):**
- `id`: Auto-incrementing primary key.
- `device_id`: A string identifier for the microcontroller.
- `created_at`: The timestamp when the data was received by the server.
- `gas_raw`: Raw gas reading.
- `gas_lpg`: LPG gas reading.
- `gas_co`: CO gas reading.

## ESP32 Microcontroller Setup

A ready-to-use Arduino sketch is provided in `esp32_sensor_node/esp32_sensor_node.ino`. 

**1. Required Arduino Libraries:**
Make sure you have the following libraries installed in your Arduino IDE via the Library Manager:
- `ArduinoJson` by Benoit Blanchon
- `DHT sensor library` by Adafruit
- `Adafruit BMP280 Library` by Adafruit

**2. Hardware Wiring:**
- **DHT11**: Connect the data pin to GPIO 4.
- **BMP280**: Connect via I2C (SDA, SCL pins) with the default I2C address `0x76` (or `0x77`).
- **MQ9**: Connect the analog output pin to GPIO 34.

**3. Configuration:**
Open the sketch and update the Wi-Fi credentials at the top of the file to match the Raspberry Pi server's hotspot:
```cpp
String ssid = "SERVER_HOTSPOT_SSID";
String password = "SERVER_HOTSPOT_PASSWORD";
```
*(Note: A future update will allow configuring these via RFID.)*

**4. Flashing:**
Compile and upload the sketch to your ESP32. Once connected, it will use mDNS to automatically find the server at `http://prk.local:8000` and begin streaming temperature and gas data every 11 seconds!
