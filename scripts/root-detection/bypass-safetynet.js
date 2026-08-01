/**
 * bypass-safetynet.js
 *
 * Hooks Google SafetyNet Attestation API and the newer Play Integrity API
 * to make attestation checks appear to succeed.
 *
 * Covered APIs:
 *  - com.google.android.gms.safetynet.SafetyNetApi (legacy)
 *  - com.google.android.play.core.integrity (Play Integrity API)
 *
 * Tested Android API levels: 21–34, Google Play Services 22+
 * Known limitations:
 *   - The actual JWS (JSON Web Signature) from SafetyNet is signed by Google's server;
 *     this hook intercepts the callback before the app parses the response and injects
 *     a fake "passing" response. Apps with server-side JWS verification will still fail.
 *   - Hardware-backed attestation (HARDWARE_BACKED verdict) cannot be faked on non-rooted
 *     devices; this hook is most effective combined with other root bypass scripts.
 */

'use strict';

const TAG = '[frida-kit][bypass-safetynet]';

// A minimal SafetyNet attestation JWS payload that claims ctsProfileMatch=true
// NOTE: This JWT is NOT signed and will fail server-side signature verification.
// It works for apps that parse only the payload without verifying the signature.
const FAKE_JWS_PAYLOAD = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.'
    + btoa(JSON.stringify({
        timestampMs: Date.now(),
        nonce: 'AAAAAAAAAAAAAAAAAAAAAA==',
        apkPackageName: 'com.example.app',
        apkCertificateDigestSha256: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
        apkDigestSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        ctsProfileMatch: true,
        basicIntegrity: true,
        evaluationType: 'BASIC'
    })) + '.FAKESIGNATURE';

Java.perform(function () {

    // ---- SafetyNetClient.attest() result callback ----
    // The app registers a success/failure listener. Hook the Task result classes.
    try {
        // Hook SafetyNetApi.AttestationResponse
        const AttestationResponse = Java.use('com.google.android.gms.safetynet.SafetyNetApi$AttestationResponse');
        AttestationResponse.getJwsResult.implementation = function () {
            console.log(TAG + ' SafetyNetApi.AttestationResponse.getJwsResult() -> fake passing JWS');
            return FAKE_JWS_PAYLOAD;
        };
        console.log(TAG + ' Hooked SafetyNetApi.AttestationResponse.getJwsResult');
    } catch (e) {
        console.log(TAG + ' SafetyNetApi.AttestationResponse not found: ' + e.message);
    }

    // ---- Hook the HarmfulAppsResponse ----
    try {
        const HarmfulAppsResponse = Java.use('com.google.android.gms.safetynet.SafetyNetApi$HarmfulAppsResponse');
        HarmfulAppsResponse.getHarmfulAppsList.implementation = function () {
            console.log(TAG + ' getHarmfulAppsList() -> empty list');
            return Java.use('java.util.ArrayList').$new();
        };
    } catch (e) {
        // Not always present
    }

    // ---- Play Integrity API: IntegrityTokenResponse ----
    try {
        const IntegrityTokenResponse = Java.use('com.google.android.play.core.integrity.IntegrityTokenResponse');
        IntegrityTokenResponse.token.implementation = function () {
            console.log(TAG + ' IntegrityTokenResponse.token() -> fake token');
            // Return a minimal fake token (3-part dot-separated string)
            return 'eyJhbGciOiJSUzI1NiJ9.eyJ2ZXJkaWN0IjoidW5rbm93biJ9.FAKESIG';
        };
        console.log(TAG + ' Hooked Play Integrity IntegrityTokenResponse.token');
    } catch (e) {
        console.log(TAG + ' Play Integrity API not found: ' + e.message);
    }

    // ---- Hook Status.isSuccess() in GMS Task results ----
    // Some apps check Status.isSuccess() before reading the attestation response
    try {
        const Status = Java.use('com.google.android.gms.common.api.Status');
        Status.isSuccess.implementation = function () {
            const result = this.isSuccess();
            const statusCode = this.getStatusCode();
            if (!result) {
                console.log(TAG + ' Status.isSuccess() was false (code=' + statusCode + '), returning true');
                return true;
            }
            return result;
        };
        console.log(TAG + ' Hooked com.google.android.gms.common.api.Status.isSuccess');
    } catch (e) {
        console.log(TAG + ' Status.isSuccess hook failed: ' + e.message);
    }

    // ---- Scan for app-level attestation result parsing classes ----
    Java.enumerateLoadedClasses({
        onMatch: function (className) {
            try {
                if (className.toLowerCase().indexOf('attestation') !== -1 ||
                    className.toLowerCase().indexOf('integrity') !== -1 ||
                    className.toLowerCase().indexOf('safetynet') !== -1) {
                    console.log(TAG + ' Found attestation-related class: ' + className);
                }
            } catch (e) { /* skip */ }
        },
        onComplete: function () {
            console.log(TAG + ' Class scan for attestation classes complete');
        }
    });

    console.log(TAG + ' SafetyNet/Play Integrity bypass loaded.');
});
