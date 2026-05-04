#include <WiFi.h>
#include <HTTPClient.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------
// Configuration
// ---------------------------------------------------------
String DEVICE_ID = "ESP32-Gas-01";

// Wi-Fi Credentials
String ssid = "SERVER_HOTSPOT_SSID";
String password = "SERVER_HOTSPOT_PASSWORD";

// Server Details
const char* mdns_hostname = "prk"; // Resolves to prk.local
int server_port = 8000;
String api_endpoint = "/api/data";
IPAddress server_ip;

// Sensor Pins
#define MQ9_PIN 34 // Analog Pin for MQ9

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("Initializing Gas sensor...");
  pinMode(MQ9_PIN, INPUT);

  connectToWiFi();
  if (!MDNS.begin("esp32-gas-client")) {
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

  int gas_raw = analogRead(MQ9_PIN);
  float gas_lpg = gas_raw * 0.02; 
  float gas_co = gas_raw * 0.005;

  String server_url = "http://" + server_ip.toString() + ":" + String(server_port) + api_endpoint;
  sendGasData(server_url, gas_raw, gas_lpg, gas_co);

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

void sendGasData(String url, float raw, float lpg, float co) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<200> doc;
    doc["type"] = "gas";
    doc["device_id"] = DEVICE_ID;
    doc["gas_raw"] = raw;
    doc["gas_lpg"] = lpg;
    doc["gas_co"] = co;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    http.end();
  }
}
