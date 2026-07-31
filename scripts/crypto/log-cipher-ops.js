/**
 * log-cipher-ops.js
 *
 * Hooks javax.crypto.Cipher to log algorithm name, key bytes, IV, and
 * plaintext/ciphertext data on every encrypt/decrypt operation.
 *
 * Tested Android API levels: 19–34
 * Known limitations:
 *   - Very large cipher operations (>64KB) are truncated in the log.
 *   - Hardware-backed Keystore operations may not expose key bytes.
 *   - Does not hook JNI-level crypto (OpenSSL/BoringSSL via native code).
 */

'use strict';

const TAG = '[frida-kit][log-cipher-ops]';
const MAX_DATA = 512; // bytes to log

function bytesToHex(javaByteArray) {
    if (!javaByteArray) return '<null>';
    const hex = [];
    const len = Math.min(javaByteArray.length, MAX_DATA);
    for (let i = 0; i < len; i++) {
        hex.push(('0' + (javaByteArray[i] & 0xff).toString(16)).slice(-2));
    }
    let result = hex.join('');
    if (javaByteArray.length > MAX_DATA) result += '...[+' + (javaByteArray.length - MAX_DATA) + ' bytes]';
    return result;
}

function bytesToUtf8(javaByteArray) {
    if (!javaByteArray) return '<null>';
    try {
        const s = Java.use('java.lang.String').$new(javaByteArray, 'UTF-8');
        const str = s.toString();
        if (str.length > MAX_DATA) return str.substring(0, MAX_DATA) + '...[truncated]';
        return str;
    } catch (e) {
        return '<non-UTF8>';
    }
}

Java.perform(function () {
    const Cipher = Java.use('javax.crypto.Cipher');

    // ---- Cipher.init() — capture key and IV ----
    // init(int opmode, Key key)
    Cipher.init.overload('int', 'java.security.Key').implementation = function (opmode, key) {
        const algo = this.getAlgorithm();
        const mode = opmode === 1 ? 'ENCRYPT' : opmode === 2 ? 'DECRYPT' : 'WRAP/UNWRAP';
        console.log('\n' + TAG + ' Cipher.init: algo=' + algo + ' mode=' + mode);
        try {
            const keyBytes = key.getEncoded();
            if (keyBytes) console.log(TAG + ' Key (hex): ' + bytesToHex(keyBytes));
        } catch (e) { console.log(TAG + ' Key: <not exportable>'); }
        return this.init(opmode, key);
    };

    // init(int opmode, Key key, AlgorithmParameterSpec params)
    Cipher.init.overload('int', 'java.security.Key', 'java.security.spec.AlgorithmParameterSpec').implementation = function (opmode, key, params) {
        const algo = this.getAlgorithm();
        const mode = opmode === 1 ? 'ENCRYPT' : opmode === 2 ? 'DECRYPT' : 'WRAP/UNWRAP';
        console.log('\n' + TAG + ' Cipher.init(with params): algo=' + algo + ' mode=' + mode);
        try {
            const keyBytes = key.getEncoded();
            if (keyBytes) console.log(TAG + ' Key (hex): ' + bytesToHex(keyBytes));
        } catch (e) { console.log(TAG + ' Key: <not exportable>'); }
        try {
            const IvParameterSpec = Java.use('javax.crypto.spec.IvParameterSpec');
            const ivSpec = Java.cast(params, IvParameterSpec);
            console.log(TAG + ' IV  (hex): ' + bytesToHex(ivSpec.getIV()));
        } catch (e) { /* not an IvParameterSpec */ }
        return this.init(opmode, key, params);
    };

    // ---- Cipher.doFinal() — capture plaintext / ciphertext ----
    // doFinal(byte[] input)
    Cipher.doFinal.overload('[B').implementation = function (input) {
        const algo = this.getAlgorithm();
        console.log('\n' + TAG + ' Cipher.doFinal: algo=' + algo);
        console.log(TAG + ' Input (hex): ' + bytesToHex(input));
        console.log(TAG + ' Input (txt): ' + bytesToUtf8(input));

        const output = this.doFinal(input);
        console.log(TAG + ' Output(hex): ' + bytesToHex(output));
        return output;
    };

    // doFinal() — no args (stream mode)
    Cipher.doFinal.overload().implementation = function () {
        const output = this.doFinal();
        console.log('\n' + TAG + ' Cipher.doFinal() (no input): output(hex)=' + bytesToHex(output));
        return output;
    };

    // doFinal(byte[] input, int inputOffset, int inputLen)
    Cipher.doFinal.overload('[B', 'int', 'int').implementation = function (input, offset, length) {
        const algo = this.getAlgorithm();
        const slice = Java.array('byte', Array.from({ length: length }, (_, i) => input[offset + i]));
        console.log('\n' + TAG + ' Cipher.doFinal(offset): algo=' + algo);
        console.log(TAG + ' Input (hex): ' + bytesToHex(slice));

        const output = this.doFinal(input, offset, length);
        console.log(TAG + ' Output(hex): ' + bytesToHex(output));
        return output;
    };

    console.log(TAG + ' javax.crypto.Cipher hooks loaded.');
});
