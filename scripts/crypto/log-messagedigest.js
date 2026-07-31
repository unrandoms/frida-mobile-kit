/**
 * log-messagedigest.js
 *
 * Hooks java.security.MessageDigest to log all hash inputs and digests.
 * Useful for identifying what data is being hashed (tokens, passwords, etc.)
 * and verifying hash implementations.
 *
 * Tested Android API levels: 19–34
 * Known limitations:
 *   - update() can be called multiple times before digest(); this script tracks
 *     accumulated input per MessageDigest instance using a WeakMap.
 *   - Native-backed MessageDigest (e.g., hardware-accelerated SHA on some SoCs)
 *     may not expose data through Java hooks.
 */

'use strict';

const TAG = '[frida-kit][log-messagedigest]';
const MAX_LOG = 256;

// Map from MessageDigest instance (by toString) to accumulated byte arrays
const accumulator = new WeakMap();

function bytesToHex(javaByteArray) {
    if (!javaByteArray) return '<null>';
    const hex = [];
    for (let i = 0; i < javaByteArray.length; i++) {
        hex.push(('0' + (javaByteArray[i] & 0xff).toString(16)).slice(-2));
    }
    return hex.join('');
}

function bytesToUtf8(javaByteArray) {
    if (!javaByteArray) return '';
    try {
        return Java.use('java.lang.String').$new(javaByteArray, 'UTF-8').toString().substring(0, MAX_LOG);
    } catch (e) {
        return '<non-UTF8>';
    }
}

Java.perform(function () {
    const MessageDigest = Java.use('java.security.MessageDigest');

    // ---- update(byte[] input) ----
    MessageDigest.update.overload('[B').implementation = function (input) {
        const key = this.getAlgorithm() + '_' + this.toString();
        if (!accumulator.has(this)) accumulator.set(this, []);
        const arr = accumulator.get(this);
        if (input) {
            for (let i = 0; i < input.length; i++) arr.push(input[i] & 0xff);
        }
        return this.update(input);
    };

    // ---- update(byte[] input, int offset, int len) ----
    MessageDigest.update.overload('[B', 'int', 'int').implementation = function (input, offset, len) {
        if (!accumulator.has(this)) accumulator.set(this, []);
        const arr = accumulator.get(this);
        if (input) {
            for (let i = offset; i < offset + len; i++) arr.push(input[i] & 0xff);
        }
        return this.update(input, offset, len);
    };

    // ---- update(byte input) ----
    MessageDigest.update.overload('byte').implementation = function (input) {
        if (!accumulator.has(this)) accumulator.set(this, []);
        accumulator.get(this).push(input & 0xff);
        return this.update(input);
    };

    // ---- digest() — finalize and log ----
    MessageDigest.digest.overload().implementation = function () {
        const algo = this.getAlgorithm();
        const digest = this.digest();

        const accumulated = accumulator.get(this) || [];
        accumulator.delete(this);
        const inputBytes = Java.array('byte', accumulated);

        console.log('\n' + TAG + ' MessageDigest.digest()');
        console.log(TAG + ' Algorithm  : ' + algo);
        console.log(TAG + ' Input len  : ' + accumulated.length + ' bytes');
        if (accumulated.length > 0) {
            console.log(TAG + ' Input (hex): ' + bytesToHex(inputBytes).substring(0, MAX_LOG * 2));
            console.log(TAG + ' Input (txt): ' + bytesToUtf8(inputBytes));
        }
        console.log(TAG + ' Digest(hex): ' + bytesToHex(digest));

        return digest;
    };

    // ---- digest(byte[] input) — convenience method ----
    MessageDigest.digest.overload('[B').implementation = function (input) {
        const algo = this.getAlgorithm();

        // Include any previously accumulated bytes
        const prior = accumulator.get(this) || [];
        accumulator.delete(this);
        const allBytes = prior.concat(Array.from({ length: input.length }, (_, i) => input[i] & 0xff));
        const inputBytes = Java.array('byte', allBytes);

        const digest = this.digest(input);

        console.log('\n' + TAG + ' MessageDigest.digest(input)');
        console.log(TAG + ' Algorithm  : ' + algo);
        console.log(TAG + ' Input len  : ' + allBytes.length + ' bytes');
        console.log(TAG + ' Input (hex): ' + bytesToHex(inputBytes).substring(0, MAX_LOG * 2));
        console.log(TAG + ' Input (txt): ' + bytesToUtf8(inputBytes));
        console.log(TAG + ' Digest(hex): ' + bytesToHex(digest));

        return digest;
    };

    // ---- Static MessageDigest.isEqual() calls ----
    MessageDigest.isEqual.implementation = function (digesta, digestb) {
        const result = this.isEqual(digesta, digestb);
        console.log(TAG + ' MessageDigest.isEqual(): ' + result
            + ' a=' + bytesToHex(digesta) + ' b=' + bytesToHex(digestb));
        return result;
    };

    console.log(TAG + ' MessageDigest hook loaded (SHA-1, SHA-256, MD5, etc.)');
});
