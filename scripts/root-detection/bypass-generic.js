/**
 * bypass-generic.js
 *
 * Hooks common root detection patterns used by custom implementations:
 *  - File.exists() for known su/magisk/busybox paths
 *  - Runtime.exec() / ProcessBuilder to block shell command execution
 *  - System property reads (android.os.Build TAG checks, ro.debuggable, ro.secure)
 *  - PackageManager.getPackageInfo() for known root management apps
 *
 * Tested Android API levels: 19–34
 * Known limitations:
 *   - Native file access (open() syscall) bypassed separately via Interceptor; not included here.
 *   - Very obfuscated apps encode path strings; this won't catch those without deobfuscation.
 */

'use strict';

const TAG = '[frida-kit][bypass-generic]';

// Known paths checked by root detection routines
const ROOT_PATHS = [
    '/su', '/system/su', '/system/bin/su', '/system/xbin/su',
    '/sbin/su', '/vendor/bin/su', '/data/local/su', '/data/local/bin/su',
    '/data/local/xbin/su', '/system/sd/xbin/su', '/system/bin/failsafe/su',
    '/dev/com.koushikdutta.superuser.daemon',
    '/system/app/Superuser.apk', '/system/app/SuperSU.apk',
    '/data/app/com.noshufou.android.su', '/data/app/eu.chainfire.supersu',
    '/system/xbin/busybox', '/system/bin/busybox', '/sbin/busybox',
    '/dev/magisk', '/sbin/.magisk', '/data/adb/magisk', '/proc/net/xt_qtaguid',
];

const ROOT_PACKAGES = [
    'com.noshufou.android.su', 'com.noshufou.android.su.elite',
    'eu.chainfire.supersu', 'com.koushikdutta.superuser',
    'com.thirdparty.superuser', 'com.yellowes.su',
    'com.topjohnwu.magisk', 'me.weishu.kernelsu',
    'com.kingroot.kinguser', 'com.kingo.root', 'com.smedialink.oneclickroot',
    'com.zhiqupk.root.global', 'com.alephzain.framaroot',
];

const ROOT_COMMANDS = ['su', 'which su', 'busybox', 'id', 'whoami'];

Java.perform(function () {

    // ---- File.exists() ----
    try {
        const File = Java.use('java.io.File');
        File.exists.implementation = function () {
            const path = this.getAbsolutePath();
            if (ROOT_PATHS.indexOf(path) !== -1) {
                console.log(TAG + ' File.exists() blocked for: ' + path + ' -> false');
                return false;
            }
            return this.exists();
        };
        console.log(TAG + ' Hooked File.exists()');
    } catch (e) {
        console.log(TAG + ' File.exists() hook failed: ' + e.message);
    }

    // ---- File.canExecute() ----
    try {
        const File = Java.use('java.io.File');
        File.canExecute.implementation = function () {
            const path = this.getAbsolutePath();
            if (ROOT_PATHS.indexOf(path) !== -1) {
                console.log(TAG + ' File.canExecute() blocked for: ' + path + ' -> false');
                return false;
            }
            return this.canExecute();
        };
        console.log(TAG + ' Hooked File.canExecute()');
    } catch (e) {
        console.log(TAG + ' File.canExecute() hook failed: ' + e.message);
    }

    // ---- Runtime.exec() — block execution of root-revealing commands ----
    try {
        const Runtime = Java.use('java.lang.Runtime');
        Runtime.exec.overload('java.lang.String').implementation = function (cmd) {
            const cmdLower = cmd.toLowerCase().trim();
            for (const rc of ROOT_COMMANDS) {
                if (cmdLower === rc || cmdLower.endsWith('/' + rc)) {
                    console.log(TAG + ' Runtime.exec() blocked: ' + cmd);
                    // Return a dummy process that outputs nothing
                    const proc = this.exec('true');
                    return proc;
                }
            }
            return this.exec(cmd);
        };

        Runtime.exec.overload('[Ljava.lang.String;').implementation = function (cmds) {
            if (cmds && cmds.length > 0) {
                const first = cmds[0].toLowerCase().trim();
                for (const rc of ROOT_COMMANDS) {
                    if (first === rc || first.endsWith('/' + rc)) {
                        console.log(TAG + ' Runtime.exec(array) blocked: ' + cmds[0]);
                        return this.exec('true');
                    }
                }
            }
            return this.exec(cmds);
        };
        console.log(TAG + ' Hooked Runtime.exec()');
    } catch (e) {
        console.log(TAG + ' Runtime.exec() hook failed: ' + e.message);
    }

    // ---- System.getProperty() / Build.TAGS ----
    // Some apps check Build.TAGS == "test-keys"
    try {
        const Build = Java.use('android.os.Build');
        const tagsField = Build.class.getDeclaredField('TAGS');
        tagsField.setAccessible(true);
        tagsField.set(null, 'release-keys');
        console.log(TAG + ' Build.TAGS patched to "release-keys"');
    } catch (e) {
        console.log(TAG + ' Build.TAGS patch failed: ' + e.message);
    }

    // ---- PackageManager.getPackageInfo() — block known root app lookups ----
    try {
        const PackageManager = Java.use('android.app.ApplicationPackageManager');
        PackageManager.getPackageInfo.overload('java.lang.String', 'int').implementation = function (pkg, flags) {
            if (ROOT_PACKAGES.indexOf(pkg) !== -1) {
                console.log(TAG + ' getPackageInfo blocked for root app: ' + pkg);
                const NameNotFoundException = Java.use('android.content.pm.PackageManager$NameNotFoundException');
                throw NameNotFoundException.$new(pkg);
            }
            return this.getPackageInfo(pkg, flags);
        };
        console.log(TAG + ' Hooked PackageManager.getPackageInfo()');
    } catch (e) {
        console.log(TAG + ' PackageManager.getPackageInfo() hook failed: ' + e.message);
    }

    // ---- /proc/mounts and /proc/net checks via BufferedReader ----
    try {
        const BufferedReader = Java.use('java.io.BufferedReader');
        BufferedReader.readLine.implementation = function () {
            const line = this.readLine();
            if (line !== null) {
                // Block lines that reveal /data as rw (root indicator)
                if (line.indexOf('/data') !== -1 && line.indexOf('rw,') !== -1 && line.indexOf('nosuid') === -1) {
                    console.log(TAG + ' BufferedReader.readLine: suppressed suspicious mount line');
                    return 'tmpfs /data tmpfs ro,nosuid,nodev,noexec 0 0';
                }
            }
            return line;
        };
    } catch (e) {
        console.log(TAG + ' BufferedReader.readLine() hook failed: ' + e.message);
    }

    console.log(TAG + ' Generic root detection bypass loaded.');
});
