/**
 * bypass-okhttp.js
 *
 * Hooks OkHttpClient certificate pinning for both OkHttp 3.x and 4.x.
 * OkHttp 3.x uses CertificatePinner.check(String host, List<Certificate> peerCertificates)
 * OkHttp 4.x uses CertificatePinner.check$okhttp(String host, List<Certificate> peerCertificates)
 *
 * Tested Android API levels: 21–34
 * Known limitations:
 *   - Does not bypass network_security_config.xml pinning (see bypass-trustmanager.js)
 *   - Does not handle apps using OkHttp via Kotlin extensions directly
 */

'use strict';

const TAG = '[frida-kit][bypass-okhttp]';

Java.perform(function () {
    // ----- OkHttp 3.x -----
    try {
        const CertificatePinner3 = Java.use('com.squareup.okhttp.CertificatePinner');
        CertificatePinner3.check.overload('java.lang.String', 'java.util.List').implementation = function (hostname, peerCertificates) {
            console.log(TAG + ' OkHttp3 CertificatePinner.check() bypassed for host: ' + hostname);
            return;
        };
        console.log(TAG + ' Hooked OkHttp 3.x CertificatePinner.check (List variant)');
    } catch (e) {
        console.log(TAG + ' OkHttp 3.x (com.squareup.okhttp) not found, skipping');
    }

    // ----- OkHttp 3.x alternative package (okhttp3 namespace, version 3.x) -----
    try {
        const CertificatePinner3b = Java.use('okhttp3.CertificatePinner');

        // check(String hostname, List<Certificate> peerCertificates)
        CertificatePinner3b.check.overload('java.lang.String', 'java.util.List').implementation = function (hostname, peerCertificates) {
            console.log(TAG + ' OkHttp3 (okhttp3 ns) CertificatePinner.check(List) bypassed for: ' + hostname);
            return;
        };

        console.log(TAG + ' Hooked OkHttp 3.x (okhttp3 namespace) CertificatePinner');
    } catch (e) {
        console.log(TAG + ' OkHttp 3.x (okhttp3 namespace) not found, skipping');
    }

    // ----- OkHttp 4.x (Kotlin) -----
    // In OkHttp 4.x the method is internal and named check$okhttp
    try {
        const CertificatePinner4 = Java.use('okhttp3.CertificatePinner');

        // check$okhttp is the internal method used in 4.x; it accepts (String, List)
        try {
            CertificatePinner4['check$okhttp'].overload('java.lang.String', 'java.util.List').implementation = function (hostname, peerCertificates) {
                console.log(TAG + ' OkHttp 4.x CertificatePinner.check$okhttp bypassed for: ' + hostname);
                return;
            };
            console.log(TAG + ' Hooked OkHttp 4.x check$okhttp (List variant)');
        } catch (inner) {
            console.log(TAG + ' check$okhttp(List) not found: ' + inner.message);
        }

        // Some 4.x builds expose check(String, List<X509Certificate>) instead
        try {
            const X509CertificateClass = Java.use('java.security.cert.X509Certificate');
            CertificatePinner4.check.overload('java.lang.String', '[Ljava.security.cert.X509Certificate;').implementation = function (hostname, peerCerts) {
                console.log(TAG + ' OkHttp 4.x CertificatePinner.check(X509[]) bypassed for: ' + hostname);
                return;
            };
            console.log(TAG + ' Hooked OkHttp 4.x check(String, X509Certificate[])');
        } catch (inner2) {
            // expected on most builds
        }
    } catch (e) {
        console.log(TAG + ' OkHttp 4.x (okhttp3.CertificatePinner) not found: ' + e.message);
    }

    // ----- Retrofit2 uses OkHttp under the hood; no additional hook needed -----

    // ----- ApplicationInterceptors / NetworkInterceptors chain -----
    // Some apps add a custom TrustManager inside an OkHttpClient.Builder.
    // Hooking SSLSocketFactory and X509TrustManager is handled in bypass-trustmanager.js.

    console.log(TAG + ' Bypass loaded. All pinning checks in scope will be suppressed.');
});
