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
String DEVICE_ID = "ESP32-Node-01";

// Wi-Fi Credentials (Can be updated via RFID in future updates)
String ssid = "SERVER_HOTSPOT_SSID";
String password = "SERVER_HOTSPOT_PASSWORD";

// Server Details
const char* mdns_hostname = "prk"; // This resolves to prk.local
int server_port = 8000;
String api_endpoint = "/api/data";
IPAddress server_ip;

// Sensor Pins
#define DHTPIN 4
#define DHTTYPE DHT11
#define MQ9_PIN 34 // Analog Pin for MQ9

// ---------------------------------------------------------
// Global Objects
// ---------------------------------------------------------
DHT dht(DHTPIN, DHTTYPE);
Adafruit_BMP280 bmp; // I2C interface (SDA, SCL)

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize Sensors
  Serial.println("Initializing sensors...");
  dht.begin();
  
  if (!bmp.begin(0x76)) { // 0x76 is common for BMP280, use 0x77 if it fails
    Serial.println("Could not find a valid BMP280 sensor, check wiring!");
  }
  
  pinMode(MQ9_PIN, INPUT);

  // Connect to Wi-Fi
  connectToWiFi();

  // Initialize mDNS
  if (!MDNS.begin("esp32-client")) {
    Serial.println("Error setting up MDNS responder!");
  }

  // Resolve Server IP
  resolveServerIP();
}

void loop() {
  // Reconnect if Wi-Fi drops
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection lost. Reconnecting...");
    connectToWiFi();
    resolveServerIP(); // Re-resolve in case server IP changed
  }

  // Ensure we have the server IP
  if (server_ip == INADDR_NONE) {
    resolveServerIP();
    delay(5000);
    return;
  }

  // 1. Read DHT11 and BMP280
  float t_dht = dht.readTemperature();
  float t_bmp = bmp.readTemperature();

  if (isnan(t_dht)) {
    Serial.println("Failed to read from DHT sensor!");
    t_dht = 0.0;
  }

  // 2. Read MQ9 Gas Sensor
  int gas_raw = analogRead(MQ9_PIN);
  
  // NOTE: True LPG and CO ppm require sensor calibration using Ro/Rs ratios
  // Providing generic scaled approximations for testing purposes
  float gas_lpg = gas_raw * 0.02; 
  float gas_co = gas_raw * 0.005;

  // 3. Send Data to Server
  String server_url = "http://" + server_ip.toString() + ":" + String(server_port) + api_endpoint;
  
  sendTemperatureData(server_url, t_dht, t_bmp);
  delay(500); // Slight delay between requests
  sendGasData(server_url, gas_raw, gas_lpg, gas_co);

  // Wait 11 seconds before next reading (to match your backend logic)
  delay(11000); 
}

// ---------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------

void connectToWiFi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid.c_str(), password.c_str());

  // Infinite loop to ensure network is connected
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  
  Serial.println("\nSuccessfully connected to Wi-Fi!");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}

void resolveServerIP() {
  Serial.print("Resolving mDNS hostname: ");
  Serial.print(mdns_hostname);
  Serial.println(".local ...");
  
  server_ip = MDNS.queryHost(mdns_hostname);
  
  while (server_ip == INADDR_NONE) {
    Serial.println("Failed to resolve mDNS. Retrying in 2 seconds...");
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
    Serial.print("Temp HTTP Response code: ");
    Serial.println(httpResponseCode);
    
    http.end();
  }
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
    Serial.print("Gas HTTP Response code: ");
    Serial.println(httpResponseCode);
    
    http.end();
  }
}
