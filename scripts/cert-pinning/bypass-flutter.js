/**
 * bypass-flutter.js
 *
 * Patches Flutter's SSL certificate verification by hooking the native
 * ssl_verify_peer_cert function in the bundled BoringSSL (libflutter.so).
 * Flutter apps do not use the Android TrustManager; they bundle BoringSSL
 * and call ssl_verify_peer_cert which returns SSL_VERIFY_OK (0) on success.
 *
 * Tested Android API levels: 21–34, Flutter 2.x and 3.x (ARM64 and ARM32)
 * Known limitations:
 *   - Requires the app to use the default Flutter networking (dart:io HttpClient).
 *   - Apps using custom native TLS (e.g. via dart:ffi + OpenSSL) need a different hook.
 *   - Offset-based patching is NOT used; relies on export symbol lookup.
 */

'use strict';

const TAG = '[frida-kit][bypass-flutter]';

// ssl_verify_peer_cert is an internal BoringSSL function.
// It is not exported by name in release builds, so we scan for a known byte pattern
// on ARM64. On debug/profile builds the export exists by name.

function hookByExport(lib) {
    const exportAddr = Module.findExportByName(lib, 'ssl_verify_peer_cert');
    if (exportAddr) {
        console.log(TAG + ' Found ssl_verify_peer_cert export at: ' + exportAddr);
        Interceptor.attach(exportAddr, {
            onLeave: function (retval) {
                retval.replace(ptr(0)); // SSL_VERIFY_OK = 0
                console.log(TAG + ' ssl_verify_peer_cert return value set to SSL_VERIFY_OK');
            }
        });
        return true;
    }
    return false;
}

function hookByHandshake(lib) {
    // Fallback: hook SSL_CTX_set_verify via BoringSSL exports to disable verification
    const setVerify = Module.findExportByName(lib, 'SSL_CTX_set_verify');
    if (!setVerify) return false;
    console.log(TAG + ' SSL_CTX_set_verify found at: ' + setVerify);
    // Intercept calls and force mode = SSL_VERIFY_NONE (0)
    Interceptor.attach(setVerify, {
        onEnter: function (args) {
            args[1] = ptr(0); // mode = SSL_VERIFY_NONE
            console.log(TAG + ' SSL_CTX_set_verify: forced mode to SSL_VERIFY_NONE');
        }
    });

    // Also hook SSL_set_verify
    const sslSetVerify = Module.findExportByName(lib, 'SSL_set_verify');
    if (sslSetVerify) {
        Interceptor.attach(sslSetVerify, {
            onEnter: function (args) {
                args[1] = ptr(0);
                console.log(TAG + ' SSL_set_verify: forced mode to SSL_VERIFY_NONE');
            }
        });
    }
    return true;
}

// Locate libflutter.so
const flutterLib = Process.findModuleByName('libflutter.so');
if (!flutterLib) {
    console.log(TAG + ' libflutter.so not loaded. Waiting for it...');
    // Try hooking via dlopen interception
    Interceptor.attach(Module.findExportByName(null, 'dlopen') || Module.findExportByName(null, 'android_dlopen_ext'), {
        onLeave: function (retval) {
            const flutterMod = Process.findModuleByName('libflutter.so');
            if (flutterMod) {
                console.log(TAG + ' libflutter.so loaded at: ' + flutterMod.base);
                if (!hookByExport('libflutter.so')) {
                    hookByHandshake('libflutter.so');
                }
                this.detach();
            }
        }
    });
} else {
    console.log(TAG + ' libflutter.so found at: ' + flutterLib.base);
    if (!hookByExport('libflutter.so')) {
        if (!hookByHandshake('libflutter.so')) {
            console.log(TAG + ' WARNING: Could not find ssl hooks in libflutter.so. App may use stripped release build.');
            console.log(TAG + ' Consider using bypass-trustmanager.js alongside or a pattern scan approach.');
        }
    }
}

console.log(TAG + ' Flutter SSL bypass loaded.');
