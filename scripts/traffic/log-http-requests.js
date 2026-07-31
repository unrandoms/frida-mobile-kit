/**
 * log-http-requests.js
 *
 * Hooks OkHttp3/4 and HttpURLConnection to log all outgoing HTTP requests
 * and incoming responses, including URLs, headers, and body content.
 *
 * Tested Android API levels: 21–34
 * Known limitations:
 *   - Large response bodies may be truncated at 4096 bytes to avoid performance impact.
 *   - Streaming responses (chunked transfer) may not be fully captured.
 *   - gzip-compressed bodies are decompressed before logging if OkHttp handles decompression.
 */

'use strict';

const TAG = '[frida-kit][log-http-requests]';
const MAX_BODY_SIZE = 4096;

function bytesToString(bytes) {
    try {
        if (!bytes) return '<null>';
        const charset = Java.use('java.nio.charset.Charset');
        return Java.use('java.lang.String').$new(bytes, charset.forName('UTF-8'));
    } catch (e) {
        return '<binary data, length=' + (bytes ? bytes.length : 0) + '>';
    }
}

Java.perform(function () {

    // ---- OkHttp3 / OkHttp4: hook via okhttp3.OkHttpClient ----
    try {
        const RealCall = Java.use('okhttp3.internal.connection.RealCall');

        RealCall.execute.implementation = function () {
            const request = this.request();
            const url = request.url().toString();
            const method = request.method();
            const headers = request.headers().toString();

            console.log('\n' + TAG + ' >>> REQUEST');
            console.log(TAG + ' Method : ' + method);
            console.log(TAG + ' URL    : ' + url);
            console.log(TAG + ' Headers:\n' + headers);

            // Log request body if present
            try {
                const reqBody = request.body();
                if (reqBody !== null) {
                    const buffer = Java.use('okio.Buffer').$new();
                    reqBody.writeTo(buffer);
                    const bodyStr = buffer.readUtf8();
                    console.log(TAG + ' Body   : ' + bodyStr.substring(0, MAX_BODY_SIZE));
                }
            } catch (bodyErr) {
                console.log(TAG + ' Body   : <could not read: ' + bodyErr.message + '>');
            }

            const response = this.execute();

            // Log response
            try {
                const respCode = response.code();
                const respHeaders = response.headers().toString();
                console.log(TAG + ' <<< RESPONSE ' + respCode);
                console.log(TAG + ' Headers:\n' + respHeaders);

                const respBody = response.peekBody(MAX_BODY_SIZE);
                if (respBody !== null) {
                    console.log(TAG + ' Body   : ' + respBody.string());
                }
            } catch (respErr) {
                console.log(TAG + ' <response read error: ' + respErr.message + '>');
            }

            return response;
        };
        console.log(TAG + ' Hooked okhttp3.internal.connection.RealCall.execute');
    } catch (e) {
        console.log(TAG + ' RealCall.execute hook failed: ' + e.message);
    }

    // ---- HttpURLConnection ----
    try {
        const URL = Java.use('java.net.URL');
        const URLCls = Java.use('java.net.HttpURLConnection');

        URLCls.getInputStream.implementation = function () {
            const urlStr = this.getURL().toString();
            const method = this.getRequestMethod();
            const responseCode = this.getResponseCode();
            console.log('\n' + TAG + ' >>> HttpURLConnection');
            console.log(TAG + ' Method       : ' + method);
            console.log(TAG + ' URL          : ' + urlStr);
            console.log(TAG + ' Response Code: ' + responseCode);

            const inputStream = this.getInputStream();

            // Wrap inputStream to log body
            try {
                const InputStreamReader = Java.use('java.io.InputStreamReader');
                const BufferedReader = Java.use('java.io.BufferedReader');
                const reader = BufferedReader.$new(InputStreamReader.$new(inputStream));
                let line;
                const bodyLines = [];
                let totalLen = 0;
                while ((line = reader.readLine()) !== null && totalLen < MAX_BODY_SIZE) {
                    bodyLines.push(line);
                    totalLen += line.length;
                }
                console.log(TAG + ' Body: ' + bodyLines.join('\n').substring(0, MAX_BODY_SIZE));
                // Note: this consumes the stream; best used with buffered streams
            } catch (streamErr) {
                console.log(TAG + ' Body read error: ' + streamErr.message);
            }

            return inputStream;
        };
        console.log(TAG + ' Hooked HttpURLConnection.getInputStream');
    } catch (e) {
        console.log(TAG + ' HttpURLConnection hook failed: ' + e.message);
    }

    console.log(TAG + ' HTTP request logger loaded.');
});
