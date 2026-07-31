/**
 * log-websocket.js
 *
 * Hooks OkHttp WebSocket send and receive to log all frames.
 * Covers both text (String) and binary (ByteString) frames.
 *
 * Tested Android API levels: 21–34, OkHttp 3.x and 4.x
 * Known limitations:
 *   - Binary frames are hex-dumped; large frames truncated at 2048 bytes.
 *   - Does not hook java.net WebSocket (API 25+ java.net.http not on Android pre-34).
 */

'use strict';

const TAG = '[frida-kit][log-websocket]';
const MAX_FRAME = 2048;

function hexDump(byteString) {
    try {
        const bytes = byteString.toByteArray();
        const hex = [];
        const len = Math.min(bytes.length, MAX_FRAME / 2);
        for (let i = 0; i < len; i++) {
            hex.push(('0' + (bytes[i] & 0xff).toString(16)).slice(-2));
        }
        const result = hex.join(' ');
        if (bytes.length > len) return result + ' ... [truncated, total=' + bytes.length + ' bytes]';
        return result;
    } catch (e) {
        return '<hex dump error: ' + e.message + '>';
    }
}

Java.perform(function () {

    // ---- RealWebSocket (OkHttp 3.x and 4.x share same class name) ----
    try {
        const RealWebSocket = Java.use('okhttp3.internal.ws.RealWebSocket');

        // send(String text)
        try {
            RealWebSocket.send.overload('java.lang.String').implementation = function (text) {
                console.log('\n' + TAG + ' >>> SEND TEXT');
                console.log(TAG + ' ' + text.substring(0, MAX_FRAME));
                return this.send(text);
            };
            console.log(TAG + ' Hooked RealWebSocket.send(String)');
        } catch (e) {
            console.log(TAG + ' RealWebSocket.send(String) not found: ' + e.message);
        }

        // send(ByteString bytes)
        try {
            RealWebSocket.send.overload('okio.ByteString').implementation = function (bytes) {
                console.log('\n' + TAG + ' >>> SEND BINARY');
                console.log(TAG + ' ' + hexDump(bytes));
                return this.send(bytes);
            };
            console.log(TAG + ' Hooked RealWebSocket.send(ByteString)');
        } catch (e) {
            console.log(TAG + ' RealWebSocket.send(ByteString) not found: ' + e.message);
        }

        // onMessage(WebSocket, String) -- incoming text frame
        try {
            RealWebSocket.onMessage.overload('okhttp3.WebSocket', 'java.lang.String').implementation = function (ws, text) {
                console.log('\n' + TAG + ' <<< RECEIVE TEXT');
                console.log(TAG + ' ' + text.substring(0, MAX_FRAME));
                return this.onMessage(ws, text);
            };
            console.log(TAG + ' Hooked RealWebSocket.onMessage(WebSocket, String)');
        } catch (e) {
            // Older OkHttp versions use a listener approach; try below
        }

        // onMessage(WebSocket, ByteString) -- incoming binary frame
        try {
            RealWebSocket.onMessage.overload('okhttp3.WebSocket', 'okio.ByteString').implementation = function (ws, bytes) {
                console.log('\n' + TAG + ' <<< RECEIVE BINARY');
                console.log(TAG + ' ' + hexDump(bytes));
                return this.onMessage(ws, bytes);
            };
            console.log(TAG + ' Hooked RealWebSocket.onMessage(WebSocket, ByteString)');
        } catch (e) {
            // Ignore
        }

    } catch (e) {
        console.log(TAG + ' okhttp3.internal.ws.RealWebSocket not found: ' + e.message);
    }

    // ---- WebSocketListener approach (OkHttp listener callbacks on app side) ----
    // Enumerate WebSocketListener implementations to hook their onMessage callbacks
    Java.enumerateLoadedClasses({
        onMatch: function (className) {
            try {
                const cls = Java.use(className);
                if (cls.onMessage && cls.class.getSuperclass() &&
                    cls.class.getSuperclass().getName() === 'okhttp3.WebSocketListener') {
                    try {
                        cls.onMessage.overload('okhttp3.WebSocket', 'java.lang.String').implementation = function (ws, text) {
                            console.log('\n' + TAG + ' <<< LISTENER.onMessage TEXT [' + className + ']');
                            console.log(TAG + ' ' + text.substring(0, MAX_FRAME));
                            return this.onMessage(ws, text);
                        };
                    } catch (inner) { /* overload not found */ }
                    try {
                        cls.onMessage.overload('okhttp3.WebSocket', 'okio.ByteString').implementation = function (ws, bytes) {
                            console.log('\n' + TAG + ' <<< LISTENER.onMessage BINARY [' + className + ']');
                            console.log(TAG + ' ' + hexDump(bytes));
                            return this.onMessage(ws, bytes);
                        };
                    } catch (inner) { /* overload not found */ }
                }
            } catch (e) { /* skip */ }
        },
        onComplete: function () {
            console.log(TAG + ' WebSocketListener scan complete.');
        }
    });

    console.log(TAG + ' WebSocket logger loaded.');
});
