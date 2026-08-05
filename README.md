# frida-mobile-kit

A practical Frida script toolkit for Android application dynamic analysis. Covers certificate pinning bypass, HTTP/WebSocket traffic logging, cryptographic key extraction, root detection bypass, and runtime memory inspection.

## Scripts at a glance

```
scripts/
  cert-pinning/
    bypass-okhttp.js          # OkHttp 3.x + 4.x CertificatePinner
    bypass-trustmanager.js    # X509TrustManager, WebView SSL, HttpsURLConnection
    bypass-conscrypt.js       # Conscrypt TrustManagerImpl, NetworkSecurityTrustManager
    bypass-flutter.js         # Flutter BoringSSL ssl_verify_peer_cert (native)
    bypass-react-native.js    # React Native / Hermes OkHttp + OkHttpClientProvider
  traffic/
    log-http-requests.js      # Log all OkHttp + HttpURLConnection requests/responses
    log-websocket.js          # Log WebSocket send/receive frames
    extract-json-bodies.js    # Pretty-print JSON request/response bodies
  crypto/
    log-cipher-ops.js         # Log Cipher algorithm, key, IV, plaintext/ciphertext
    extract-aes-keys.js       # Dump SecretKeySpec + PBKDF2 key bytes at creation
    log-messagedigest.js      # Log all MessageDigest inputs and digests
  root-detection/
    bypass-rootbeer.js        # RootBeer library bypass
    bypass-generic.js         # File.exists, Runtime.exec, Build.TAGS, PackageManager
    bypass-safetynet.js       # SafetyNet Attestation + Play Integrity API
  memory/
    dump-strings.js           # Heap dump of live Java String objects
    find-class-methods.js     # List methods/fields of any class at runtime
    trace-method-calls.js     # Trace method calls with args and return values
```

## Setup

```bash
pip install -r requirements.txt
```

Push `frida-server` to your device:

```bash
adb push frida-server /data/local/tmp/
adb shell chmod 755 /data/local/tmp/frida-server
adb shell /data/local/tmp/frida-server &
```

Download `frida-server` matching your `frida` version from the [Frida releases page](https://github.com/frida/frida/releases).

## Quick start

### Bypass certificate pinning

```bash
# Single OkHttp bypass
frida -U -l scripts/cert-pinning/bypass-okhttp.js -f com.example.app --no-pause

# All pinning bypass scripts at once (via CLI)
python cli/frida_kit.py run --all-pinning --target com.example.app

# OkHttp + TrustManager + Conscrypt combined (most comprehensive)
frida -U \
  -l scripts/cert-pinning/bypass-okhttp.js \
  -l scripts/cert-pinning/bypass-trustmanager.js \
  -l scripts/cert-pinning/bypass-conscrypt.js \
  -f com.example.app --no-pause
```

### Log HTTP traffic

```bash
frida -U -l scripts/traffic/log-http-requests.js -n com.example.app

# Save output to file
python cli/frida_kit.py run traffic/log-http-requests \
  --target com.example.app --output http_traffic.log
```

### Extract crypto keys

```bash
frida -U \
  -l scripts/crypto/extract-aes-keys.js \
  -l scripts/crypto/log-cipher-ops.js \
  -f com.example.app --no-pause
```

### Bypass root detection

```bash
python cli/frida_kit.py run --all-root-bypass --target com.example.app
```

### Trace a specific method

Edit `scripts/memory/trace-method-calls.js`:
```javascript
const TARGET_CLASS = 'com.example.app.AuthManager';
const TARGET_METHOD = 'verifyToken';
const TARGET_PARAMS = ['java.lang.String'];
```
Then:
```bash
frida -U -l scripts/memory/trace-method-calls.js -f com.example.app --no-pause
```

## CLI wrapper

```bash
python cli/frida_kit.py list
python cli/frida_kit.py run cert-pinning/bypass-okhttp --target com.example.app
python cli/frida_kit.py run cert-pinning/bypass-okhttp --target com.example.app --device USB --spawn
python cli/frida_kit.py run --all-pinning --target com.example.app
python cli/frida_kit.py run traffic/log-http-requests --target com.example.app --output reqs.log
```

## Combining scripts

Scripts are independent and can be combined freely with multiple `-l` flags:

```bash
frida -U \
  -l scripts/cert-pinning/bypass-okhttp.js \
  -l scripts/cert-pinning/bypass-trustmanager.js \
  -l scripts/root-detection/bypass-generic.js \
  -l scripts/traffic/log-http-requests.js \
  -f com.example.app --no-pause
```

Each script logs with a unique prefix (`[frida-kit][script-name]`) for easy grepping:

```bash
frida ... 2>&1 | grep '\[frida-kit\]\[bypass-okhttp\]'
```

## Script notes

### OkHttp versions

`bypass-okhttp.js` hooks both the 3.x (`com.squareup.okhttp`) and 4.x (`okhttp3`) namespaces and their internal method variants (`check` vs `check$okhttp`). The script prints which hooks succeeded at startup.

### Flutter apps

Flutter bundles BoringSSL inside `libflutter.so`; Java-level TrustManager hooks have no effect. Use `bypass-flutter.js` which hooks at the native level via `ssl_verify_peer_cert` or `SSL_CTX_set_verify`. On fully stripped release builds the export symbol may be absent — the script logs a warning with guidance.

### SafetyNet / Play Integrity

`bypass-safetynet.js` intercepts the response callback before the app parses it. Apps that verify the JWS signature server-side will still fail; this script is effective for apps that only check `ctsProfileMatch` or `basicIntegrity` on the client.

## Tested environments

| Android version | API level | Architecture |
|---|---|---|
| Android 14 | 34 | ARM64 |
| Android 13 | 33 | ARM64 |
| Android 12 | 32 | ARM64 |
| Android 11 | 30 | ARM64 |
| Android 10 | 29 | ARM64 + x86_64 |

frida-tools: 12.3+, frida: 16.2+

## See also

Full usage examples, device setup, and configuration options: [USAGE.md](USAGE.md)
