/**
 * find-class-methods.js
 *
 * Lists all methods (declared and inherited) of a given Java class at runtime,
 * including return types, parameter types, and modifiers.
 *
 * Usage:
 *   Set TARGET_CLASS to the fully-qualified class name before attaching.
 *   frida -U -l find-class-methods.js -f com.example.app
 *
 * Tested Android API levels: 19–34
 * Known limitations:
 *   - Private methods of superclasses are included only if INCLUDE_INHERITED = true.
 *   - Synthetic (bridge) methods may appear for Kotlin/generic classes.
 */

'use strict';

const TAG = '[frida-kit][find-class-methods]';

// ---- CONFIGURATION ----
const TARGET_CLASS = 'com.example.app.SomeClass'; // Change to your target class
const INCLUDE_INHERITED = true;                     // false = declared methods only
const INCLUDE_FIELDS = true;                        // also list fields
// -----------------------

function modifiersToString(modifiers) {
    const Modifier = Java.use('java.lang.reflect.Modifier');
    return Modifier.toString(modifiers);
}

function typeListToString(types) {
    const result = [];
    for (let i = 0; i < types.length; i++) {
        result.push(types[i].getName());
    }
    return result.join(', ');
}

Java.perform(function () {

    setTimeout(function () {
        try {
            const targetClass = Java.use(TARGET_CLASS);
            const clazz = targetClass.class;

            console.log('\n' + TAG + ' ========================================');
            console.log(TAG + ' Class: ' + clazz.getName());
            console.log(TAG + ' Super: ' + (clazz.getSuperclass() ? clazz.getSuperclass().getName() : 'none'));

            // Interfaces
            const ifaces = clazz.getInterfaces();
            if (ifaces.length > 0) {
                const ifaceNames = [];
                for (let i = 0; i < ifaces.length; i++) ifaceNames.push(ifaces[i].getName());
                console.log(TAG + ' Implements: ' + ifaceNames.join(', '));
            }

            // Methods
            const methods = INCLUDE_INHERITED ? clazz.getMethods() : clazz.getDeclaredMethods();
            console.log(TAG + '\n--- METHODS (' + methods.length + ') ---');
            for (let i = 0; i < methods.length; i++) {
                const m = methods[i];
                try {
                    m.setAccessible(true);
                    const mods = modifiersToString(m.getModifiers());
                    const retType = m.getReturnType().getName();
                    const params = typeListToString(m.getParameterTypes());
                    const exceptions = typeListToString(m.getExceptionTypes());
                    const excStr = exceptions ? ' throws ' + exceptions : '';
                    console.log(TAG + '  [' + mods + '] ' + retType + ' ' + m.getName() + '(' + params + ')' + excStr);
                } catch (e) {
                    console.log(TAG + '  <could not inspect method: ' + e.message + '>');
                }
            }

            // Constructors
            const ctors = clazz.getDeclaredConstructors();
            console.log(TAG + '\n--- CONSTRUCTORS (' + ctors.length + ') ---');
            for (let i = 0; i < ctors.length; i++) {
                const c = ctors[i];
                try {
                    const params = typeListToString(c.getParameterTypes());
                    console.log(TAG + '  ' + c.getName() + '(' + params + ')');
                } catch (e) {
                    console.log(TAG + '  <could not inspect constructor>');
                }
            }

            // Fields
            if (INCLUDE_FIELDS) {
                const fields = INCLUDE_INHERITED ? clazz.getFields() : clazz.getDeclaredFields();
                console.log(TAG + '\n--- FIELDS (' + fields.length + ') ---');
                for (let i = 0; i < fields.length; i++) {
                    const f = fields[i];
                    try {
                        f.setAccessible(true);
                        const mods = modifiersToString(f.getModifiers());
                        console.log(TAG + '  [' + mods + '] ' + f.getType().getName() + ' ' + f.getName());
                    } catch (e) {
                        console.log(TAG + '  <could not inspect field>');
                    }
                }
            }

            console.log(TAG + ' ========================================\n');

        } catch (e) {
            console.log(TAG + ' ERROR: Could not load class "' + TARGET_CLASS + '": ' + e.message);
            console.log(TAG + ' Make sure the class is loaded (the app may need to reach a specific activity first).');
        }
    }, 2000);

    console.log(TAG + ' find-class-methods loaded. Target: ' + TARGET_CLASS);
});
