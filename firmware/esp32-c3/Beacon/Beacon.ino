#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>  // Install ArduinoJson 7 in Arduino Library Manager.
#include <BLEDevice.h>
#include <BLEAdvertising.h>
#include "BackendConfig.h"

// HVL Info ESP32-C3 pilot. Wi-Fi is normally OFF: BLE advertises while
// the device occasionally connects to HTTPS to check desired configuration.
// This is NOT a continuous MQTT client. Requires 2.4 GHz WPA2-Personal Wi-Fi.
// A separate, IT-approved device SSID is required for enterprise campus use.

Preferences prefs;
WebServer portal(80);
BLEAdvertising *advertising = nullptr;
String hardwareId, wifiSsid, wifiPassword, displayName;
String enrollmentToken, deviceId, deviceKey;
String setupPassword, setupSsid;
bool portalRunning = false;
bool bleStarted = false;
bool bleEnabled = false;
uint32_t nextPoll = 0;
uint32_t pollIntervalMs = 3600000; // server may change (bounded below)
uint32_t configVersion = 0;
constexpr uint8_t BOOT_PIN = 9;
const char *FIRMWARE_VERSION = "0.2.0-pilot";

String htmlEscape(String input) {
  input.replace("&", "&amp;"); input.replace("<", "&lt;");
  input.replace(">", "&gt;"); input.replace("\"", "&quot;");
  input.replace("'", "&#39;");
  return input;
}
String newApPassword() {
  const char alphabet[] = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  String value;
  for (int i=0; i<14; ++i) value += alphabet[esp_random() % (sizeof(alphabet)-1)];
  return value;
}
void wifiOff() {
  WiFi.disconnect(true, false);
  WiFi.mode(WIFI_OFF);
}
void stopBeacon() {
  if (advertising) advertising->stop();
  bleEnabled = false;
}
void applyBeacon(JsonObjectConst config) {
  if (!config["enabled"].as<bool>()) { stopBeacon(); return; }
  const char *uuidText = config["uuid"] | "";
  uint8_t uuid[16] = {0};
  unsigned int parts[16];
  if (strlen(uuidText) != 36 ||
      sscanf(uuidText, "%2x%2x%2x%2x-%2x%2x-%2x%2x-%2x%2x-%2x%2x%2x%2x%2x%2x",
        &parts[0],&parts[1],&parts[2],&parts[3],&parts[4],&parts[5],
        &parts[6],&parts[7],&parts[8],&parts[9],&parts[10],&parts[11],
        &parts[12],&parts[13],&parts[14],&parts[15]) != 16) {
    Serial.println("Invalid beacon UUID; not advertising"); stopBeacon(); return;
  }
  for(int i=0;i<16;i++) uuid[i]=static_cast<uint8_t>(parts[i]);
  uint16_t major=config["major"].as<uint16_t>();
  uint16_t minor=config["minor"].as<uint16_t>();
  int power=config["measured_power"] | -59;
  uint8_t data[25]={0x4c,0x00,0x02,0x15};
  memcpy(data+4,uuid,16);
  data[20]=major>>8; data[21]=major&0xff;
  data[22]=minor>>8; data[23]=minor&0xff;
  data[24]=static_cast<uint8_t>(power);
  if (!bleStarted) {
    BLEDevice::init("");
    advertising=BLEDevice::getAdvertising();
    bleStarted=true;
  }
  stopBeacon();
  BLEAdvertisementData advertisement;
  advertisement.setFlags(0x06);
  advertisement.setManufacturerData(String(reinterpret_cast<char*>(data),25));
  advertising->setAdvertisementData(advertisement);
  advertising->start();
  bleEnabled=true;
  Serial.printf("iBeacon active: major=%u minor=%u\n",major,minor);
}
void saveConfiguration(JsonDocument &document, bool isEnrollment) {
  JsonObjectConst config = document["config"].as<JsonObjectConst>();
  if (config.isNull()) return;
  prefs.begin("hvl-beacon", false);
  String serialized;
  serializeJson(config,serialized);
  prefs.putString("beacon",serialized);
  if (isEnrollment) {
    prefs.putString("dev-id",document["device_id"].as<String>());
    prefs.putString("dev-key",document["device_key"].as<String>());
    prefs.putString("name",displayName);
    deviceId=document["device_id"].as<String>();
    deviceKey=document["device_key"].as<String>();
    enrollmentToken=""; // Never persist an enrollment token.
  }
  configVersion=document["config_version"] | configVersion;
  prefs.putUInt("version",configVersion);
  prefs.end();
  uint32_t seconds=document["poll_interval_seconds"] | 3600;
  if(seconds<300) seconds=300;
  if(seconds>86400) seconds=86400;
  pollIntervalMs=seconds*1000UL;
  applyBeacon(config);
}
bool postJson(const String &path, const String &body, String &response, int &status) {
  if (!String(HVL_API_BASE_URL).startsWith("https://") ||
      strlen(HVL_ROOT_CA_PEM)<100) {
    Serial.println("TLS CA/API not configured. Refusing insecure connection.");
    return false;
  }
  WiFiClientSecure tls;
  tls.setCACert(HVL_ROOT_CA_PEM);
  HTTPClient http;
  if(!http.begin(tls,String(HVL_API_BASE_URL)+path)) return false;
  http.setTimeout(10000);
  http.addHeader("Content-Type","application/json");
  if(path=="/device/check-in") {
    http.addHeader("x-device-id",deviceId);
    http.addHeader("x-device-key",deviceKey);
  }
  status=http.POST(body);
  response=http.getString();
  http.end();
  return status>=200 && status<300;
}
bool connectStation() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(),wifiPassword.c_str());
  for(int i=0;i<40 && WiFi.status()!=WL_CONNECTED;i++) delay(500);
  if(WiFi.status()!=WL_CONNECTED) { wifiOff(); return false; }
  return true;
}
bool syncOnce() {
  if(wifiSsid.isEmpty()) return false;
  if(!connectStation()) { Serial.println("Wi-Fi unavailable; BLE unchanged"); return false; }
  JsonDocument request;
  request["hardware_id"]=hardwareId;
  String path;
  if(deviceKey.isEmpty()) {
    if(enrollmentToken.isEmpty()) { wifiOff(); return false; }
    path="/device/provision";
    request["provisioning_token"]=enrollmentToken;
    request["name"]=displayName;
  } else {
    path="/device/check-in";
    request["config_version"]=configVersion;
    request["firmware_version"]=FIRMWARE_VERSION;
  }
  String payload,response;
  serializeJson(request,payload);
  int status=0;
  bool ok=postJson(path,payload,response,status);
  wifiOff(); // Keep BLE on; radio's Wi-Fi side stays off between checks.
  if(!ok) {
    Serial.printf("Backend sync failed (HTTP %d); BLE unchanged\n",status);
    // Auth revoked: stop advertising until an operator re-enrolls.
    if(status==401 && !deviceKey.isEmpty()) stopBeacon();
    return false;
  }
  JsonDocument result;
  if(deserializeJson(result,response)) { Serial.println("Bad JSON response"); return false; }
  saveConfiguration(result, path=="/device/provision");
  return true;
}
void page(const String &message="") {
  // Scan while in AP+STA mode; the setup page never asks for a hidden API URL.
  WiFi.mode(WIFI_AP_STA);
  int n=WiFi.scanNetworks();
  String html="<!doctype html><html lang='no'><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html+="<title>HVL Info beacon</title><style>body{font:1rem system-ui;max-width:36rem;margin:2rem auto;padding:1rem}input,select,button{box-sizing:border-box;width:100%;padding:.7rem;margin:.4rem 0 1rem}label{font-weight:600}</style>";
  html+="<h1>Sett opp HVL Info-beacon</h1><p>Enhet: "+htmlEscape(hardwareId)+"</p><p>"+htmlEscape(message)+"</p>";
  html+="<form action='/save' method='post'><label>Navn</label><input name='name' maxlength='80' required value='"+htmlEscape(displayName)+"'>";
  html+="<label>Velg 2,4 GHz Wi-Fi</label><select name='ssid'><option value=''>Velg nettverk</option>";
  for(int i=0;i<n;i++) {
    String ssid=WiFi.SSID(i);
    html+="<option value=\""+htmlEscape(ssid)+"\">"+htmlEscape(ssid)+" ("+WiFi.RSSI(i)+" dBm)</option>";
  }
  html+="</select><label>SSID manuelt (skjulte nett)</label><input name='ssid_manual' maxlength='32'>";
  html+="<label>Wi-Fi-passord</label><input name='password' type='password' maxlength='64'>";
  html+="<label>Engangskode fra HVL Info Admin</label><input name='token' maxlength='120' required>";
  html+="<button>Ta i bruk</button></form><p>Dette oppsettet støtter WPA2-Personal; ikke eduroam/802.1X.</p></html>";
  WiFi.scanDelete();
  portal.sendHeader("Cache-Control","no-store");
  portal.sendHeader("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
  portal.send(200,"text/html; charset=utf-8",html);
}
void startPortal() {
  if(portalRunning) return;
  stopBeacon();
  if(setupPassword.isEmpty()) {
    prefs.begin("hvl-beacon",false);
    setupPassword=prefs.getString("ap-pass","");
    if(setupPassword.isEmpty()) {
      setupPassword=newApPassword();
      prefs.putString("ap-pass",setupPassword);
    }
    prefs.end();
  }
  String suffix=hardwareId.substring(max(0,(int)hardwareId.length()-6));
  setupSsid="HVL-INFO-"+suffix;
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(setupSsid.c_str(),setupPassword.c_str());
  Serial.println("\n=== LOCAL SETUP ===");
  Serial.println("SSID: "+setupSsid);
  Serial.println("AP password: "+setupPassword+" (print to device label before enclosure)");
  Serial.println("Open http://192.168.4.1 on connected phone");
  portal.on("/",HTTP_GET,[](){page();});
  portal.on("/save",HTTP_POST,[](){
    if(portal.arg("name").length()<1 || portal.arg("name").length()>80 ||
       portal.arg("token").length()<20 || portal.arg("token").length()>120) {
      page("Ugyldig navn eller engangskode."); return;
    }
    displayName=portal.arg("name");
    wifiSsid=portal.arg("ssid_manual").isEmpty()?portal.arg("ssid"):portal.arg("ssid_manual");
    wifiPassword=portal.arg("password");
    enrollmentToken=portal.arg("token");
    if(wifiSsid.isEmpty() || wifiSsid.length()>32 || wifiPassword.length()>64) {
      page("Ugyldig Wi-Fi-navn/passord."); return;
    }
    prefs.begin("hvl-beacon",false);
    prefs.putString("ssid",wifiSsid);
    prefs.putString("pass",wifiPassword);
    prefs.putString("name",displayName);
    prefs.end();
    portal.send(200,"text/plain; charset=utf-8",
      "Konfigurasjonen er lagret. Enheten forsøker å koble seg til HVL Info. Sjekk adminstatus.");
    delay(250);
    portal.stop();
    WiFi.softAPdisconnect(true);
    portalRunning=false;
    nextPoll=millis()+1000;
  });
  portal.begin();
  portalRunning=true;
}
void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(BOOT_PIN,INPUT_PULLUP);
  uint64_t mac=ESP.getEfuseMac();
  char buffer[17];
  snprintf(buffer,sizeof(buffer),"%012llX",(unsigned long long)mac);
  hardwareId=String(buffer);
  Serial.println("HVL Info hardware ID: "+hardwareId);
  prefs.begin("hvl-beacon",true);
  wifiSsid=prefs.getString("ssid","");
  wifiPassword=prefs.getString("pass","");
  displayName=prefs.getString("name","");
  deviceId=prefs.getString("dev-id","");
  deviceKey=prefs.getString("dev-key","");
  configVersion=prefs.getUInt("version",0);
  setupPassword=prefs.getString("ap-pass","");
  String cached=prefs.getString("beacon","");
  prefs.end();
  if(!cached.isEmpty() && !deviceKey.isEmpty()) {
    JsonDocument saved;
    if(!deserializeJson(saved,cached)) applyBeacon(saved.as<JsonObjectConst>());
  }
  if(wifiSsid.isEmpty() || deviceKey.isEmpty()) startPortal();
  else nextPoll=millis()+1500;
}
void loop() {
  if(portalRunning) { portal.handleClient(); delay(5); return; }
  // Hold BOOT for 5 sec AFTER startup to reopen setup. Do not hold at power-on:
  // GPIO9 is a strapping pin, so that could enter ROM download mode.
  static uint32_t held=0;
  if(digitalRead(BOOT_PIN)==LOW) {
    if(!held) held=millis();
    if(millis()-held>5000) {
      prefs.begin("hvl-beacon",false);
      prefs.remove("ssid");prefs.remove("pass");prefs.remove("dev-key");
      prefs.remove("dev-id");prefs.remove("beacon");
      prefs.end();
      wifiSsid="";wifiPassword="";deviceKey="";deviceId="";held=0;
      startPortal();return;
    }
  } else held=0;
  if((int32_t)(millis()-nextPoll)>=0) {
    bool synced=syncOnce();
    nextPoll=millis()+(synced?pollIntervalMs:300000UL);
    if(!synced && deviceKey.isEmpty() && enrollmentToken.isEmpty()) startPortal();
  }
  delay(100);
}
