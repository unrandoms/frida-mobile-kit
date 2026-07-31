/**
 * extract-aes-keys.js
 *
 * Hooks javax.crypto.spec.SecretKeySpec constructor to dump key bytes
 * the moment any symmetric key is created. Captures AES, HMAC, DES,
 * 3DES and any other SecretKeySpec-wrapped keys.
 *
 * Tested Android API levels: 19–34
 * Known limitations:
 *   - Keys derived via KeyGenerator or inside Android Keystore (hardware-backed)
 *     may not go through SecretKeySpec and will not be captured.
 *   - PBKDF2-derived keys only appear if the resulting bytes are wrapped in SecretKeySpec.
 */

'use strict';

const TAG = '[frida-kit][extract-aes-keys]';

function bytesToHex(javaByteArray) {
    if (!javaByteArray) return '<null>';
    const hex = [];
    for (let i = 0; i < javaByteArray.length; i++) {
        hex.push(('0' + (javaByteArray[i] & 0xff).toString(16)).slice(-2));
    }
    return hex.join('');
}

function stackTrace() {
    try {
        const Exception = Java.use('java.lang.Exception');
        const e = Exception.$new();
        const stack = e.getStackTrace();
        const frames = [];
        const limit = Math.min(stack.length, 8);
        for (let i = 1; i < limit; i++) {
            frames.push('    at ' + stack[i].toString());
        }
        return frames.join('\n');
    } catch (e) {
        return '    <stack trace unavailable>';
    }
}

Java.perform(function () {
    const SecretKeySpec = Java.use('javax.crypto.spec.SecretKeySpec');

    // SecretKeySpec(byte[] key, String algorithm)
    SecretKeySpec.$init.overload('[B', 'java.lang.String').implementation = function (keyBytes, algorithm) {
        console.log('\n' + TAG + ' SecretKeySpec created');
        console.log(TAG + ' Algorithm : ' + algorithm);
        console.log(TAG + ' Key length: ' + keyBytes.length + ' bytes (' + (keyBytes.length * 8) + ' bits)');
        console.log(TAG + ' Key (hex) : ' + bytesToHex(keyBytes));
        console.log(TAG + ' Call stack:\n' + stackTrace());
        return this.$init(keyBytes, algorithm);
    };

    // SecretKeySpec(byte[] key, int offset, int len, String algorithm)
    SecretKeySpec.$init.overload('[B', 'int', 'int', 'java.lang.String').implementation = function (keyBytes, offset, len, algorithm) {
        const slice = Java.array('byte', Array.from({ length: len }, (_, i) => keyBytes[offset + i]));
        console.log('\n' + TAG + ' SecretKeySpec created (offset variant)');
        console.log(TAG + ' Algorithm : ' + algorithm);
        console.log(TAG + ' Key length: ' + len + ' bytes (' + (len * 8) + ' bits)');
        console.log(TAG + ' Key (hex) : ' + bytesToHex(slice));
        console.log(TAG + ' Call stack:\n' + stackTrace());
        return this.$init(keyBytes, offset, len, algorithm);
    };

    // ---- Also hook KeyGenerator.generateKey for runtime-generated keys ----
    try {
        const KeyGenerator = Java.use('javax.crypto.KeyGenerator');
        KeyGenerator.generateKey.implementation = function () {
            const key = this.generateKey();
            try {
                const algo = this.getAlgorithm();
                const encoded = key.getEncoded();
                if (encoded) {
                    console.log('\n' + TAG + ' KeyGenerator.generateKey: algo=' + algo);
                    console.log(TAG + ' Key length: ' + encoded.length + ' bytes (' + (encoded.length * 8) + ' bits)');
                    console.log(TAG + ' Key (hex) : ' + bytesToHex(encoded));
                } else {
                    console.log('\n' + TAG + ' KeyGenerator.generateKey: algo=' + algo + ' <key not exportable>');
                }
            } catch (e) {
                console.log(TAG + ' KeyGenerator hook read error: ' + e.message);
            }
            return key;
        };
        console.log(TAG + ' Hooked KeyGenerator.generateKey');
    } catch (e) {
        console.log(TAG + ' KeyGenerator hook failed: ' + e.message);
    }

    // ---- PBEKeySpec / PBKDF2 ----
    try {
        const PBEKeySpec = Java.use('javax.crypto.spec.PBEKeySpec');
        PBEKeySpec.$init.overload('[C', '[B', 'int', 'int').implementation = function (password, salt, iterations, keyLength) {
            const pwStr = Java.use('java.lang.String').$new(password);
            console.log('\n' + TAG + ' PBEKeySpec created (PBKDF2)');
            console.log(TAG + ' Password  : ' + pwStr.toString());
            console.log(TAG + ' Salt (hex): ' + bytesToHex(salt));
            console.log(TAG + ' Iterations: ' + iterations);
            console.log(TAG + ' Key length: ' + keyLength + ' bits');
            return this.$init(password, salt, iterations, keyLength);
        };
        console.log(TAG + ' Hooked PBEKeySpec (PBKDF2 passwords)');
    } catch (e) {
        console.log(TAG + ' PBEKeySpec hook failed: ' + e.message);
    }

    console.log(TAG + ' AES/symmetric key extractor loaded.');
});
