#!/usr/bin/env python3
"""
frida_kit.py — CLI wrapper for frida-mobile-kit scripts.

Commands:
  frida-kit list
  frida-kit run <script-path> --target <package>
  frida-kit run <script-path> --target <package> --device USB
  frida-kit run --all-pinning --target <package>
  frida-kit run <script-path> --target <package> --output <file>

Examples:
  python frida_kit.py list
  python frida_kit.py run cert-pinning/bypass-okhttp --target com.example.app
  python frida_kit.py run --all-pinning --target com.example.app --device USB
  python frida_kit.py run traffic/log-http-requests --target com.example.app --output reqs.log
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Optional

SCRIPTS_DIR = Path(__file__).parent.parent / "scripts"
MANIFEST_PATH = Path(__file__).parent / "manifest.json"


def load_manifest() -> dict:
    """Load the script manifest from manifest.json."""
    if not MANIFEST_PATH.exists():
        print(f"[frida-kit] ERROR: manifest.json not found at {MANIFEST_PATH}", file=sys.stderr)
        sys.exit(1)
    with MANIFEST_PATH.open() as f:
        return json.load(f)


def resolve_script_path(script_key: str) -> Path:
    """Resolve a manifest key to an absolute .js file path."""
    # script_key examples: "cert-pinning/bypass-okhttp"
    path = SCRIPTS_DIR / (script_key + ".js")
    if not path.exists():
        print(f"[frida-kit] ERROR: Script not found: {path}", file=sys.stderr)
        sys.exit(1)
    return path


def cmd_list(manifest: dict) -> None:
    """Print all available scripts with descriptions."""
    scripts = manifest.get("scripts", {})
    groups = manifest.get("groups", {})

    categories: dict = {}
    for key, info in scripts.items():
        cat = info.get("category", "misc")
        categories.setdefault(cat, []).append((key, info))

    print("\nfrida-mobile-kit — available scripts\n")
    print(f"{'Script':<42}  {'Description'}")
    print("-" * 90)

    for cat in sorted(categories):
        print(f"\n  [{cat}]")
        for key, info in sorted(categories[cat]):
            desc = info.get("description", "")
            tags = ", ".join(info.get("tags", []))
            print(f"    {key:<40}  {desc}")
            if tags:
                print(f"    {'':<40}  tags: {tags}")

    print("\n  [groups]")
    for gname, gscripts in groups.items():
        print(f"    --{gname:<38}  runs: {', '.join(gscripts)}")

    print()


def build_frida_command(
    scripts: List[Path],
    target: str,
    device: Optional[str],
    spawn: bool,
    extra_args: List[str],
) -> List[str]:
    """Build the frida CLI command from script paths and options."""
    cmd = ["frida"]

    if device == "USB" or device == "usb":
        cmd += ["-U"]
    elif device and device.startswith("emulator"):
        cmd += ["-D", device]
    else:
        cmd += ["-U"]  # default to USB

    if spawn:
        cmd += ["-f", target, "--no-pause"]
    else:
        cmd += ["-n", target]

    for script in scripts:
        cmd += ["-l", str(script)]

    cmd += extra_args
    return cmd


def cmd_run(
    manifest: dict,
    script_key: Optional[str],
    group: Optional[str],
    target: str,
    device: str,
    output: Optional[str],
    spawn: bool,
    extra_args: List[str],
) -> None:
    """Resolve scripts and invoke frida."""
    scripts: List[Path] = []

    if group:
        groups = manifest.get("groups", {})
        if group not in groups:
            print(f"[frida-kit] ERROR: Unknown group '--{group}'. Available: {list(groups)}", file=sys.stderr)
            sys.exit(1)
        for key in groups[group]:
            scripts.append(resolve_script_path(key))
        print(f"[frida-kit] Running group '{group}': {[str(s.name) for s in scripts]}")
    elif script_key:
        # Support bare category/name or full path
        if script_key.endswith(".js"):
            p = Path(script_key)
            if not p.exists():
                print(f"[frida-kit] ERROR: File not found: {script_key}", file=sys.stderr)
                sys.exit(1)
            scripts.append(p)
        else:
            # Strip leading scripts/ if user typed it
            key = script_key.removeprefix("scripts/")
            scripts.append(resolve_script_path(key))
    else:
        print("[frida-kit] ERROR: Specify a script path or a group (--all-pinning, etc.)", file=sys.stderr)
        sys.exit(1)

    cmd = build_frida_command(scripts, target, device, spawn, extra_args)
    print(f"[frida-kit] Executing: {' '.join(cmd)}\n")

    if output:
        out_path = Path(output)
        print(f"[frida-kit] Output will be written to: {out_path}")
        with out_path.open("w") as out_file:
            result = subprocess.run(cmd, stdout=out_file, stderr=subprocess.STDOUT)
    else:
        result = subprocess.run(cmd)

    if result.returncode != 0:
        print(f"\n[frida-kit] frida exited with code {result.returncode}", file=sys.stderr)
        sys.exit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="frida-kit",
        description="frida-mobile-kit CLI — attach Frida scripts to Android apps",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # list
    subparsers.add_parser("list", help="List available scripts and groups")

    # run
    run_parser = subparsers.add_parser("run", help="Run one or more scripts against an app")
    run_parser.add_argument(
        "script",
        nargs="?",
        help="Script path (e.g. cert-pinning/bypass-okhttp) or .js file",
    )
    run_parser.add_argument("--target", required=True, metavar="PACKAGE",
                            help="Target app package name (e.g. com.example.app)")
    run_parser.add_argument("--device", default="USB", metavar="DEVICE",
                            help="Device type: USB (default), emulator-XXXX, or device ID")
    run_parser.add_argument("--output", metavar="FILE",
                            help="Write frida output to this file instead of stdout")
    run_parser.add_argument("--spawn", action="store_true",
                            help="Spawn the app instead of attaching to a running process")

    # Group flags (--all-pinning, --all-root-bypass)
    run_parser.add_argument("--all-pinning", dest="group", action="store_const",
                            const="all-pinning",
                            help="Run all cert-pinning bypass scripts")
    run_parser.add_argument("--all-root-bypass", dest="group", action="store_const",
                            const="all-root-bypass",
                            help="Run all root detection bypass scripts")

    args, extra = parser.parse_known_args()
    manifest = load_manifest()

    if args.command == "list":
        cmd_list(manifest)
    elif args.command == "run":
        group = getattr(args, "group", None)
        cmd_run(
            manifest=manifest,
            script_key=args.script,
            group=group,
            target=args.target,
            device=args.device,
            output=getattr(args, "output", None),
            spawn=getattr(args, "spawn", False),
            extra_args=extra,
        )


if __name__ == "__main__":
    main()
