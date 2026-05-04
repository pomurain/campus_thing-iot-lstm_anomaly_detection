#include <WiFi.h>
#include <HTTPClient.h>
#include <ESPmDNS.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------
// Configuration
// ---------------------------------------------------------
String DEVICE_ID = "ESP32-Temp-01";

// Wi-Fi Credentials
String ssid = "SERVER_HOTSPOT_SSID";
String password = "SERVER_HOTSPOT_PASSWORD";

// Server Details
const char* mdns_hostname = "prk"; // Resolves to prk.local
int server_port = 8000;
String api_endpoint = "/api/data";
IPAddress server_ip;

// Sensor Pins
#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);
Adafruit_BMP280 bmp; // I2C interface (SDA, SCL)

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("Initializing Temp sensors...");
  dht.begin();
  if (!bmp.begin(0x76)) {
    Serial.println("Could not find a valid BMP280 sensor, check wiring!");
  }

  connectToWiFi();
  if (!MDNS.begin("esp32-temp-client")) {
    Serial.println("Error setting up MDNS responder!");
  }
  resolveServerIP();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi lost. Reconnecting...");
    connectToWiFi();
    resolveServerIP();
  }

  if (server_ip == INADDR_NONE) {
    resolveServerIP();
    delay(5000);
    return;
  }

  float t_dht = dht.readTemperature();
  float t_bmp = bmp.readTemperature();

  if (isnan(t_dht)) {
    Serial.println("Failed to read from DHT sensor!");
    t_dht = 0.0;
  }

  String server_url = "http://" + server_ip.toString() + ":" + String(server_port) + api_endpoint;
  sendTemperatureData(server_url, t_dht, t_bmp);

  delay(11000); 
}

void connectToWiFi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid.c_str(), password.c_str());
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nSuccessfully connected!");
}

void resolveServerIP() {
  Serial.print("Resolving mDNS: ");
  Serial.println(mdns_hostname);
  server_ip = MDNS.queryHost(mdns_hostname);
  while (server_ip == INADDR_NONE) {
    Serial.println("Failed to resolve mDNS. Retrying...");
    delay(2000);
    server_ip = MDNS.queryHost(mdns_hostname);
  }
  Serial.print("Resolved Server IP: ");
  Serial.println(server_ip);
}

void sendTemperatureData(String url, float dht_temp, float bmp_temp) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<200> doc;
    doc["type"] = "temp";
    doc["device_id"] = DEVICE_ID;
    doc["t_dht"] = dht_temp;
    doc["t_bmp"] = bmp_temp;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    http.end();
  }
}
