/**
 * bypass-conscrypt.js
 *
 * Hooks Conscrypt's SSL pin enforcement via
 * com.android.org.conscrypt.TrustManagerImpl and the internal
 * Platform.checkServerTrusted() used by Conscrypt on AOSP >= API 24.
 *
 * Tested Android API levels: 24–34 (Conscrypt is the default SSL provider from API 24)
 * Known limitations:
 *   - Class names may differ across custom ROMs; logs a warning when not found.
 *   - Does not bypass pinning in apps that bundle their own Conscrypt AAR.
 */

'use strict';

const TAG = '[frida-kit][bypass-conscrypt]';

Java.perform(function () {

    // ---- com.android.org.conscrypt.TrustManagerImpl ----
    // This is the AOSP Conscrypt TrustManager; it enforces both CA chain and pin validation.
    try {
        const TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');

        // checkServerTrusted(X509Certificate[] chain, String authType, String host)
        try {
            TrustManagerImpl.checkServerTrusted.overload(
                '[Ljava.security.cert.X509Certificate;',
                'java.lang.String',
                'java.lang.String'
            ).implementation = function (chain, authType, host) {
                console.log(TAG + ' TrustManagerImpl.checkServerTrusted(chain, authType, host) bypassed for: ' + host);
                return Java.use('java.util.ArrayList').$new();
            };
            console.log(TAG + ' Hooked checkServerTrusted(chain, authType, host)');
        } catch (e) {
            console.log(TAG + ' checkServerTrusted(3 args) not found: ' + e.message);
        }

        // checkServerTrusted(X509Certificate[] chain, String authType)
        try {
            TrustManagerImpl.checkServerTrusted.overload(
                '[Ljava.security.cert.X509Certificate;',
                'java.lang.String'
            ).implementation = function (chain, authType) {
                console.log(TAG + ' TrustManagerImpl.checkServerTrusted(chain, authType) bypassed');
                return;
            };
            console.log(TAG + ' Hooked checkServerTrusted(chain, authType)');
        } catch (e) {
            console.log(TAG + ' checkServerTrusted(2 args) not found: ' + e.message);
        }

        // verifyChain — internal method used in newer Conscrypt versions
        try {
            TrustManagerImpl.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
                console.log(TAG + ' TrustManagerImpl.verifyChain() bypassed for: ' + host);
                return untrustedChain;
            };
            console.log(TAG + ' Hooked TrustManagerImpl.verifyChain');
        } catch (e) {
            console.log(TAG + ' verifyChain not found: ' + e.message);
        }

    } catch (e) {
        console.log(TAG + ' com.android.org.conscrypt.TrustManagerImpl not found: ' + e.message);
    }

    // ---- Conscrypt bundled in app (org.conscrypt package) ----
    try {
        const OrgTrustManagerImpl = Java.use('org.conscrypt.TrustManagerImpl');
        OrgTrustManagerImpl.checkServerTrusted.overload(
            '[Ljava.security.cert.X509Certificate;',
            'java.lang.String',
            'java.lang.String'
        ).implementation = function (chain, authType, host) {
            console.log(TAG + ' org.conscrypt TrustManagerImpl.checkServerTrusted bypassed for: ' + host);
            return Java.use('java.util.ArrayList').$new();
        };
        console.log(TAG + ' Hooked org.conscrypt.TrustManagerImpl');
    } catch (e) {
        console.log(TAG + ' org.conscrypt.TrustManagerImpl not found (expected if not bundled)');
    }

    // ---- NetworkSecurityConfig pin enforcement via NetworkSecurityTrustManager ----
    try {
        const NetworkSecurityTrustManager = Java.use('android.security.net.config.NetworkSecurityTrustManager');
        NetworkSecurityTrustManager.checkServerTrusted.overload(
            '[Ljava.security.cert.X509Certificate;',
            'java.lang.String',
            'java.lang.String'
        ).implementation = function (chain, authType, host) {
            console.log(TAG + ' NetworkSecurityTrustManager.checkServerTrusted bypassed for: ' + host);
            return;
        };
        console.log(TAG + ' Hooked android.security.net.config.NetworkSecurityTrustManager');
    } catch (e) {
        console.log(TAG + ' NetworkSecurityTrustManager not found: ' + e.message);
    }

    console.log(TAG + ' Conscrypt SSL pin bypass loaded.');
});
