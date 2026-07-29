/**
 * bypass-react-native.js
 *
 * Bypasses SSL certificate pinning in React Native apps using the Hermes engine.
 * React Native uses OkHttp for the native fetch/XMLHttpRequest bridge, so we
 * hook OkHttp's CertificatePinner AND the React Native NetworkingModule's
 * OkHttpClient builder to inject a permissive TrustManager.
 *
 * Tested Android API levels: 21–34, React Native 0.68–0.73
 * Known limitations:
 *   - Apps using the new React Native Networking (Fetch API via Hermes) still route
 *     through OkHttp on Android, so OkHttp hooks apply.
 *   - Does not handle custom native modules that bypass OkHttp.
 */

'use strict';

const TAG = '[frida-kit][bypass-react-native]';

Java.perform(function () {

    // ---- OkHttp CertificatePinner (React Native bundles OkHttp 4.x) ----
    try {
        const CertificatePinner = Java.use('okhttp3.CertificatePinner');

        // OkHttp 4.x internal check
        try {
            CertificatePinner['check$okhttp'].overload('java.lang.String', 'java.util.List').implementation = function (hostname, peerCertificates) {
                console.log(TAG + ' CertificatePinner.check$okhttp bypassed for: ' + hostname);
            };
        } catch (e) {
            // Not present in all builds
        }

        try {
            CertificatePinner.check.overload('java.lang.String', 'java.util.List').implementation = function (hostname, peerCertificates) {
                console.log(TAG + ' CertificatePinner.check(List) bypassed for: ' + hostname);
            };
        } catch (e) {
            // Not present in all builds
        }

        console.log(TAG + ' OkHttp CertificatePinner hooks installed');
    } catch (e) {
        console.log(TAG + ' okhttp3.CertificatePinner not found: ' + e.message);
    }

    // ---- React Native OkHttpClientProvider (injects permissive TrustManager) ----
    try {
        const OkHttpClientProvider = Java.use('com.facebook.react.modules.network.OkHttpClientProvider');
        const OkHttpClientFactory = Java.use('com.facebook.react.modules.network.OkHttpClientFactory');

        OkHttpClientProvider.createClientBuilder.overload().implementation = function () {
            console.log(TAG + ' OkHttpClientProvider.createClientBuilder() intercepted');
            const builder = this.createClientBuilder();

            // Install permissive TrustManager
            const X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
            const BypassTM = Java.registerClass({
                name: 'com.fridakit.RNBypassTrustManager',
                implements: [X509TrustManager],
                methods: {
                    checkClientTrusted: function (chain, authType) { },
                    checkServerTrusted: function (chain, authType) {
                        console.log(TAG + ' RN TrustManager: checkServerTrusted suppressed');
                    },
                    getAcceptedIssuers: function () {
                        return Java.array('Ljava.security.cert.X509Certificate;', []);
                    }
                }
            });

            const managers = Java.array('Ljavax.net.ssl.TrustManager;', [BypassTM.$new()]);
            const SSLContext = Java.use('javax.net.ssl.SSLContext');
            const ctx = SSLContext.getInstance('TLS');
            ctx.init(null, managers, null);

            builder.sslSocketFactory(ctx.getSocketFactory(), BypassTM.$new());
            builder.hostnameVerifier(Java.registerClass({
                name: 'com.fridakit.RNAllowAllHostnameVerifier',
                implements: [Java.use('javax.net.ssl.HostnameVerifier')],
                methods: {
                    verify: function (hostname, session) {
                        console.log(TAG + ' HostnameVerifier.verify bypassed for: ' + hostname);
                        return true;
                    }
                }
            }).$new());

            return builder;
        };
        console.log(TAG + ' OkHttpClientProvider.createClientBuilder hooked');
    } catch (e) {
        console.log(TAG + ' OkHttpClientProvider not found (may not be in this RN version): ' + e.message);
    }

    // ---- Hermes fetch via JSI: not hookable at Java level; OkHttp hooks above are sufficient ----

    console.log(TAG + ' React Native SSL bypass loaded.');
});
