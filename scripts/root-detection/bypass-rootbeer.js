/**
 * bypass-rootbeer.js
 *
 * Hooks the RootBeer library (com.scottyab.rootbeer.RootBeer) to make all
 * root detection checks return false. Covers isRooted(), isRootedWithBusyBox(),
 * isRootedWithoutBusyBox(), and individual check methods.
 *
 * Tested Android API levels: 21–34, RootBeer 0.0.8 and 0.1.0
 * Known limitations:
 *   - Only effective if the app uses com.scottyab.rootbeer.RootBeer directly.
 *   - Does not bypass ProGuard-renamed variants automatically (use bypass-generic.js).
 */

'use strict';

const TAG = '[frida-kit][bypass-rootbeer]';

Java.perform(function () {
    try {
        const RootBeer = Java.use('com.scottyab.rootbeer.RootBeer');

        const booleanMethods = [
            'isRooted',
            'isRootedWithBusyBox',
            'isRootedWithoutBusyBox',
            'checkForBusyBoxBinary',
            'checkForSuBinary',
            'checkSuExists',
            'checkForRWPaths',
            'checkForDangerousProps',
            'checkForRootManagementApps',
            'checkForPotentiallyDangerousApps',
            'checkForRootCloakingApps',
            'checkTestKeys',
            'detectRootManagementApps',
            'detectPotentiallyDangerousApps',
            'detectTestKeys',
            'checkForMagiskBinary',
        ];

        booleanMethods.forEach(function (methodName) {
            try {
                RootBeer[methodName].implementation = function () {
                    console.log(TAG + ' RootBeer.' + methodName + '() -> false');
                    return false;
                };
                console.log(TAG + ' Hooked RootBeer.' + methodName);
            } catch (e) {
                // Method may not exist in all versions
            }
        });

        // isRooted(boolean includeTestKeys) — some builds have this variant
        try {
            RootBeer.isRooted.overload('boolean').implementation = function (includeTestKeys) {
                console.log(TAG + ' RootBeer.isRooted(boolean) -> false');
                return false;
            };
        } catch (e) { /* not in this build */ }

    } catch (e) {
        console.log(TAG + ' com.scottyab.rootbeer.RootBeer not found: ' + e.message);
    }

    // ---- RootBeerNative (native checks via JNI) ----
    try {
        const RootBeerNative = Java.use('com.scottyab.rootbeer.RootBeerNative');
        try {
            RootBeerNative.checkForRoot.implementation = function (paths) {
                console.log(TAG + ' RootBeerNative.checkForRoot() -> 0');
                return 0;
            };
        } catch (e) { /* not present */ }
    } catch (e) {
        console.log(TAG + ' RootBeerNative not found (expected if not present)');
    }

    console.log(TAG + ' RootBeer bypass loaded.');
});
