/**
 * trace-method-calls.js
 *
 * Traces all calls to a specified Java method with argument values and return value.
 * Supports tracing all overloads of a method name or a specific overload by
 * parameter signature.
 *
 * Usage:
 *   Set TARGET_CLASS, TARGET_METHOD, and optionally TARGET_PARAMS before attaching.
 *   Leave TARGET_PARAMS as null to hook all overloads.
 *
 * Tested Android API levels: 19–34
 * Known limitations:
 *   - Tracing very high-frequency methods (e.g., onDraw) will cause significant slowdown.
 *   - Reference-type arguments are printed via toString(); complex objects may truncate.
 */

'use strict';

const TAG = '[frida-kit][trace-method-calls]';

// ---- CONFIGURATION ----
const TARGET_CLASS = 'com.example.app.SomeClass';   // Fully-qualified class name
const TARGET_METHOD = 'someMethod';                  // Method name to trace
const TARGET_PARAMS = null;                          // e.g. ['java.lang.String', 'int'] or null for all overloads
const PRINT_STACK_TRACE = false;                     // Set true to include call stack
const MAX_STRING_LEN = 256;                          // Truncate long argument strings
// -----------------------

let callCount = 0;

function argToString(arg) {
    if (arg === null || arg === undefined) return 'null';
    try {
        const str = arg.toString();
        if (str.length > MAX_STRING_LEN) return str.substring(0, MAX_STRING_LEN) + '...[truncated]';
        return str;
    } catch (e) {
        return '<toString error: ' + e.message + '>';
    }
}

function getStackTrace() {
    try {
        const Exception = Java.use('java.lang.Exception');
        const e = Exception.$new();
        const stack = e.getStackTrace();
        const frames = [];
        const limit = Math.min(stack.length, 10);
        for (let i = 1; i < limit; i++) {
            frames.push('    at ' + stack[i].toString());
        }
        return frames.join('\n');
    } catch (e) {
        return '    <unavailable>';
    }
}

function hookOverload(overload, paramTypes) {
    overload.implementation = function () {
        callCount++;
        const id = '#' + callCount;

        const args = Array.prototype.slice.call(arguments);
        const argStrs = args.map(argToString);

        console.log('\n' + TAG + ' CALL ' + id + ': ' + TARGET_CLASS + '.' + TARGET_METHOD
            + (paramTypes ? '(' + paramTypes.join(', ') + ')' : '()')
        );
        args.forEach(function (arg, i) {
            console.log(TAG + '   arg[' + i + ']: ' + argStrs[i]);
        });

        if (PRINT_STACK_TRACE) {
            console.log(TAG + ' Stack:\n' + getStackTrace());
        }

        const retval = this[TARGET_METHOD].apply(this, args);

        console.log(TAG + '   return: ' + argToString(retval));

        return retval;
    };
}

Java.perform(function () {
    setTimeout(function () {
        try {
            const cls = Java.use(TARGET_CLASS);

            if (!cls[TARGET_METHOD]) {
                console.log(TAG + ' ERROR: Method "' + TARGET_METHOD + '" not found on ' + TARGET_CLASS);
                return;
            }

            if (TARGET_PARAMS !== null) {
                // Hook specific overload
                try {
                    const overload = cls[TARGET_METHOD].overload.apply(cls[TARGET_METHOD], TARGET_PARAMS);
                    hookOverload(overload, TARGET_PARAMS);
                    console.log(TAG + ' Hooked overload: ' + TARGET_METHOD + '(' + TARGET_PARAMS.join(', ') + ')');
                } catch (e) {
                    console.log(TAG + ' Could not hook specified overload: ' + e.message);
                }
            } else {
                // Hook all overloads
                const overloads = cls[TARGET_METHOD].overloads;
                if (!overloads || overloads.length === 0) {
                    console.log(TAG + ' No overloads found for ' + TARGET_METHOD);
                    return;
                }
                overloads.forEach(function (overload, idx) {
                    try {
                        const paramTypes = overload.argumentTypes.map(function (t) { return t.className; });
                        hookOverload(overload, paramTypes);
                        console.log(TAG + ' Hooked overload ' + (idx + 1) + ': ' + TARGET_METHOD + '(' + paramTypes.join(', ') + ')');
                    } catch (e) {
                        console.log(TAG + ' Could not hook overload ' + (idx + 1) + ': ' + e.message);
                    }
                });
            }

        } catch (e) {
            console.log(TAG + ' ERROR loading class "' + TARGET_CLASS + '": ' + e.message);
        }
    }, 1500);

    console.log(TAG + ' trace-method-calls loaded. Waiting for class: ' + TARGET_CLASS + '.' + TARGET_METHOD);
});
