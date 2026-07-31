/**
 * extract-json-bodies.js
 *
 * Hooks OkHttp3/4 request and response bodies, detects JSON content-type,
 * and pretty-prints extracted JSON to the Frida console.
 *
 * Tested Android API levels: 21–34
 * Known limitations:
 *   - Non-JSON bodies are skipped silently.
 *   - peekBody() clones the response buffer; adds memory overhead for large responses.
 */

'use strict';

const TAG = '[frida-kit][extract-json-bodies]';
const MAX_BODY = 8192;

function tryParseJson(str) {
    try {
        const JSONClass = Java.use('org.json.JSONObject');
        const obj = JSONClass.$new(str);
        return obj.toString(2); // pretty-print with 2-space indent
    } catch (e) {
        // Try as JSONArray
        try {
            const JSONArray = Java.use('org.json.JSONArray');
            const arr = JSONArray.$new(str);
            return arr.toString(2);
        } catch (e2) {
            return null; // Not valid JSON
        }
    }
}

function isJsonContentType(contentType) {
    if (!contentType) return false;
    const ct = contentType.toString().toLowerCase();
    return ct.indexOf('application/json') !== -1 || ct.indexOf('text/json') !== -1;
}

Java.perform(function () {

    // ---- OkHttp3/4 via RealCall.execute ----
    try {
        const RealCall = Java.use('okhttp3.internal.connection.RealCall');

        RealCall.execute.implementation = function () {
            const request = this.request();
            const reqUrl = request.url().toString();
            const reqMethod = request.method();

            // Capture request JSON body
            try {
                const reqBody = request.body();
                if (reqBody !== null) {
                    const ct = reqBody.contentType();
                    if (ct && isJsonContentType(ct.toString())) {
                        const buf = Java.use('okio.Buffer').$new();
                        reqBody.writeTo(buf);
                        const bodyStr = buf.readUtf8().substring(0, MAX_BODY);
                        const pretty = tryParseJson(bodyStr);
                        if (pretty) {
                            console.log('\n' + TAG + ' >>> JSON REQUEST BODY [' + reqMethod + ' ' + reqUrl + ']');
                            console.log(pretty);
                        }
                    }
                }
            } catch (e) { /* non-readable body */ }

            const response = this.execute();

            // Capture response JSON body
            try {
                const respBody = response.body();
                if (respBody !== null) {
                    const ct = response.header('Content-Type');
                    if (isJsonContentType(ct)) {
                        const peeked = response.peekBody(MAX_BODY);
                        const bodyStr = peeked.string();
                        const pretty = tryParseJson(bodyStr);
                        if (pretty) {
                            console.log('\n' + TAG + ' <<< JSON RESPONSE BODY [' + response.code() + ' ' + reqUrl + ']');
                            console.log(pretty);
                        }
                    }
                }
            } catch (e) { /* non-readable body */ }

            return response;
        };
        console.log(TAG + ' Hooked RealCall.execute for JSON extraction');
    } catch (e) {
        console.log(TAG + ' RealCall.execute hook failed: ' + e.message);
    }

    // ---- OkHttp3/4 enqueue (async calls) ----
    try {
        const AsyncCall = Java.use('okhttp3.internal.connection.RealCall$AsyncCall');

        AsyncCall.run.implementation = function () {
            // AsyncCall.run() dispatches the call; we hook at the callback level
            return this.run();
        };

        // Hook okhttp3.Callback.onResponse to capture async responses
        Java.enumerateLoadedClasses({
            onMatch: function (className) {
                try {
                    const cls = Java.use(className);
                    if (cls.onResponse && cls.class.getInterfaces) {
                        const ifaces = cls.class.getInterfaces();
                        for (let i = 0; i < ifaces.length; i++) {
                            if (ifaces[i].getName() === 'okhttp3.Callback') {
                                cls.onResponse.implementation = function (call, response) {
                                    try {
                                        const ct = response.header('Content-Type');
                                        if (isJsonContentType(ct)) {
                                            const peeked = response.peekBody(MAX_BODY);
                                            const bodyStr = peeked.string();
                                            const pretty = tryParseJson(bodyStr);
                                            if (pretty) {
                                                console.log('\n' + TAG + ' <<< ASYNC JSON RESPONSE [' + response.code() + ' ' + response.request().url() + ']');
                                                console.log(pretty);
                                            }
                                        }
                                    } catch (inner) { /* skip */ }
                                    return this.onResponse(call, response);
                                };
                                break;
                            }
                        }
                    }
                } catch (e) { /* skip */ }
            },
            onComplete: function () {
                console.log(TAG + ' Async callback scan complete');
            }
        });
    } catch (e) {
        console.log(TAG + ' AsyncCall hook failed: ' + e.message);
    }

    console.log(TAG + ' JSON body extractor loaded.');
});
