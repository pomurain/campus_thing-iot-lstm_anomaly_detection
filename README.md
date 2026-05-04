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
