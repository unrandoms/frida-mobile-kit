# Usage Guide — frida-mobile-kit

## Prerequisites

```bash
pip install frida-tools frida
# or install from requirements.txt:
pip install -r requirements.txt
```

Your device must have a running `frida-server` matching your installed frida version.
Download from: https://github.com/frida/frida/releases

```bash
adb push frida-server /data/local/tmp/
adb shell chmod 755 /data/local/tmp/frida-server
adb shell /data/local/tmp/frida-server &
```

---

## CLI Usage

```bash
python cli/frida_kit.py list
python cli/frida_kit.py run cert-pinning/bypass-okhttp --target com.example.app
python cli/frida_kit.py run cert-pinning/bypass-okhttp --target com.example.app --device USB
python cli/frida_kit.py run --all-pinning --target com.example.app
python cli/frida_kit.py run traffic/log-http-requests --target com.example.app --output requests.log
python cli/frida_kit.py run memory/dump-strings --target com.example.app --spawn
```

---

## Direct frida usage

### Single script
```bash
frida -U -l scripts/cert-pinning/bypass-okhttp.js -f com.example.app --no-pause
```

### Multiple scripts (combine with multiple -l flags)
```bash
frida -U \
  -l scripts/cert-pinning/bypass-okhttp.js \
  -l scripts/cert-pinning/bypass-trustmanager.js \
  -l scripts/root-detection/bypass-generic.js \
  -f com.example.app --no-pause
```

### Attach to running process
```bash
frida -U -l scripts/traffic/log-http-requests.js -n com.example.app
```

---

## Script Categories

### cert-pinning/

| Script | What it hooks |
|---|---|
| `bypass-okhttp.js` | OkHttp 3.x and 4.x `CertificatePinner.check()` |
| `bypass-trustmanager.js` | `X509TrustManager.checkServerTrusted()`, WebViewClient SSL errors, `HttpsURLConnection` |
| `bypass-conscrypt.js` | Conscrypt `TrustManagerImpl`, `NetworkSecurityTrustManager` (API 24+) |
| `bypass-flutter.js` | Flutter BoringSSL `ssl_verify_peer_cert` via native hook |
| `bypass-react-native.js` | React Native / Hermes OkHttp + `OkHttpClientProvider` |

**Recommended combination for most apps:**
```bash
frida -U \
  -l scripts/cert-pinning/bypass-okhttp.js \
  -l scripts/cert-pinning/bypass-trustmanager.js \
  -l scripts/cert-pinning/bypass-conscrypt.js \
  -f com.example.app --no-pause
```

---

### traffic/

| Script | What it hooks |
|---|---|
| `log-http-requests.js` | OkHttp `RealCall.execute`, `HttpURLConnection.getInputStream` |
| `log-websocket.js` | `RealWebSocket.send/onMessage` text and binary frames |
| `extract-json-bodies.js` | JSON request/response body pretty-printing via OkHttp |

---

### crypto/

| Script | What it hooks |
|---|---|
| `log-cipher-ops.js` | `javax.crypto.Cipher.init()` and `doFinal()` — logs key, IV, data |
| `extract-aes-keys.js` | `SecretKeySpec`, `KeyGenerator.generateKey`, `PBEKeySpec` (PBKDF2) |
| `log-messagedigest.js` | All `MessageDigest` operations — SHA-1, SHA-256, MD5, etc. |

---

### root-detection/

| Script | What it hooks |
|---|---|
| `bypass-rootbeer.js` | `com.scottyab.rootbeer.RootBeer` all boolean check methods |
| `bypass-generic.js` | `File.exists()`, `Runtime.exec()`, `Build.TAGS`, `PackageManager.getPackageInfo()` |
| `bypass-safetynet.js` | SafetyNet `AttestationResponse.getJwsResult()`, Play Integrity `IntegrityTokenResponse.token()` |

**Full root bypass:**
```bash
python cli/frida_kit.py run --all-root-bypass --target com.example.app
```

---

### memory/

| Script | Configuration |
|---|---|
| `dump-strings.js` | Set `FILTER_PATTERN` regex to narrow results |
| `find-class-methods.js` | Set `TARGET_CLASS` to the class to inspect |
| `trace-method-calls.js` | Set `TARGET_CLASS`, `TARGET_METHOD`, optionally `TARGET_PARAMS` |

Example — trace a specific method:
```javascript
// In trace-method-calls.js:
const TARGET_CLASS = 'com.example.app.AuthManager';
const TARGET_METHOD = 'login';
const TARGET_PARAMS = ['java.lang.String', 'java.lang.String'];
```

```bash
frida -U -l scripts/memory/trace-method-calls.js -f com.example.app --no-pause
```

---

## Tested Devices & Android Versions

| Device | Android | Status |
|---|---|---|
| Google Pixel 7 | Android 14 (API 34) | Verified |
| Google Pixel 6a | Android 13 (API 33) | Verified |
| Samsung Galaxy S22 | Android 13 (API 33) | Verified |
| Android Emulator x86_64 | Android 12 (API 31) | Verified |
| OnePlus 9 | Android 12 (API 32) | Verified |

frida-server version tested: 16.2.x, 16.3.x

---

## Tips

- Use `--spawn` / `-f` to inject scripts before the app starts (avoids missing early initialization).
- Combine cert pinning bypass + root bypass scripts for hardened apps.
- Add `--runtime=v8` to `frida` if scripts fail on older devices (forces V8 instead of QuickJS).
- If OkHttp hooks don't fire, the app may use a different HTTP client — try `log-http-requests.js` alongside to confirm which stack is in use.
