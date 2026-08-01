/**
 * dump-strings.js
 *
 * Scans the Java heap for live String objects and dumps their values.
 * Useful for finding hardcoded credentials, tokens, API keys and
 * other sensitive strings stored in memory.
 *
 * Usage:
 *   frida -U -l dump-strings.js -f com.example.app
 *
 * The scan runs once after a 3-second delay (to allow app initialization).
 * Set FILTER_MIN_LENGTH and FILTER_PATTERN to narrow results.
 *
 * Tested Android API levels: 21–34
 * Known limitations:
 *   - Heap enumeration can be slow on large apps; consider increasing the delay.
 *   - Strings stored only in native memory (char* in JNI) are not captured.
 */

'use strict';

const TAG = '[frida-kit][dump-strings]';

// Minimum string length to log (avoids noisy short strings)
const FILTER_MIN_LENGTH = 8;

// Optional regex filter; null = print all strings above min length
// Example: const FILTER_PATTERN = /api[_-]?key|token|secret|password|bearer/i;
const FILTER_PATTERN = null;

// Output deduplication
const seen = new Set();

function shouldLog(str) {
    if (str.length < FILTER_MIN_LENGTH) return false;
    if (FILTER_PATTERN && !FILTER_PATTERN.test(str)) return false;
    return true;
}

Java.perform(function () {
    console.log(TAG + ' Scheduling heap string dump in 3 seconds...');

    setTimeout(function () {
        console.log(TAG + ' Starting Java heap enumeration...');
        let count = 0;
        let logged = 0;

        Java.choose('java.lang.String', {
            onMatch: function (instance) {
                count++;
                try {
                    const str = instance.toString();
                    if (shouldLog(str) && !seen.has(str)) {
                        seen.add(str);
                        console.log(TAG + ' [' + str.length + '] ' + str.substring(0, 200));
                        logged++;
                    }
                } catch (e) { /* skip non-printable */ }
            },
            onComplete: function () {
                console.log(TAG + ' Heap scan complete: ' + count + ' strings examined, ' + logged + ' logged.');
            }
        });
    }, 3000);

    console.log(TAG + ' Dump-strings script loaded.');
});
