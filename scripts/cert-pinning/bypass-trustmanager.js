/**
 * bypass-trustmanager.js
 *
 * Hooks javax.net.ssl.X509TrustManager checkServerTrusted() to suppress all
 * certificate validation errors, including custom TrustManagers, network_security_config
 * pinning, and WebView SSL error handlers.
 *
 * Tested Android API levels: 19–34
 * Known limitations:
 *   - Bypasses ALL certificate validation, not just pinning; suitable for analysis only.
 *   - Does not handle BouncyCastle or Conscrypt-backed TrustManagers directly
 *     (see bypass-conscrypt.js for Conscrypt).
 */

'use strict';

const TAG = '[frida-kit][bypass-trustmanager]';

Java.perform(function () {

    // ---- javax.net.ssl.X509TrustManager (all implementations via interface hook) ----
    const X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
    const SSLContext = Java.use('javax.net.ssl.SSLContext');
    const TrustManagerArray = Java.array('Ljavax.net.ssl.TrustManager;', []);

    // Build a permissive TrustManager and install it as the default
    const BypassTrustManager = Java.registerClass({
        name: 'com.fridakit.BypassTrustManager',
        implements: [X509TrustManager],
        methods: {
            checkClientTrusted: function (chain, authType) { },
            checkServerTrusted: function (chain, authType) {
                console.log(TAG + ' checkServerTrusted() suppressed for authType: ' + authType);
            },
            getAcceptedIssuers: function () {
                return Java.array('Ljava.security.cert.X509Certificate;', []);
            }
        }
    });

    const bypassInstance = BypassTrustManager.$new();
    const managers = Java.array('Ljavax.net.ssl.TrustManager;', [bypassInstance]);

    // Install on default SSLContext
    try {
        const ctx = SSLContext.getInstance('TLS');
        ctx.init(null, managers, null);
        SSLContext.setDefault(ctx);
        console.log(TAG + ' Installed permissive TrustManager as default SSLContext');
    } catch (e) {
        console.log(TAG + ' SSLContext override failed: ' + e.message);
    }

    // ---- Hook checkServerTrusted on any class implementing X509TrustManager ----
    // Enumerate loaded classes looking for custom TrustManagers
    Java.enumerateLoadedClasses({
        onMatch: function (className) {
            try {
                const cls = Java.use(className);
                if (cls.checkServerTrusted) {
                    const overloads = cls.checkServerTrusted.overloads;
                    overloads.forEach(function (overload) {
                        overload.implementation = function () {
                            console.log(TAG + ' checkServerTrusted blocked on: ' + className);
                            return null;
                        };
                    });
                }
            } catch (e) {
                // Not all classes are hookable; skip silently
            }
        },
        onComplete: function () {
            console.log(TAG + ' Finished scanning loaded classes for TrustManager implementations');
        }
    });

    // ---- WebViewClient onReceivedSslError ----
    try {
        const WebViewClient = Java.use('android.webkit.WebViewClient');
        WebViewClient.onReceivedSslError.implementation = function (view, handler, error) {
            console.log(TAG + ' WebViewClient.onReceivedSslError() suppressed, proceeding');
            handler.proceed();
        };
        console.log(TAG + ' Hooked WebViewClient.onReceivedSslError');
    } catch (e) {
        console.log(TAG + ' WebViewClient hook failed: ' + e.message);
    }

    // ---- HttpsURLConnection: replace HostnameVerifier and SSLSocketFactory ----
    try {
        const HttpsURLConnection = Java.use('javax.net.ssl.HttpsURLConnection');
        const HostnameVerifier = Java.use('javax.net.ssl.HostnameVerifier');

        const AllowAllHostnameVerifier = Java.registerClass({
            name: 'com.fridakit.AllowAllHostnameVerifier',
            implements: [HostnameVerifier],
            methods: {
                verify: function (hostname, session) {
                    console.log(TAG + ' HostnameVerifier.verify() bypassed for: ' + hostname);
                    return true;
                }
            }
        });

        HttpsURLConnection.setDefaultHostnameVerifier(AllowAllHostnameVerifier.$new());
        console.log(TAG + ' Installed AllowAllHostnameVerifier as default HostnameVerifier');
    } catch (e) {
        console.log(TAG + ' HttpsURLConnection hook failed: ' + e.message);
    }

    console.log(TAG + ' TrustManager bypass fully loaded.');
});
