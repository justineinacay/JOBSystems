#!/usr/bin/env python3
"""Split large inline CSS and JavaScript blocks out of index.html.

This is a one-time, deterministic source migration. It preserves the original
load order and keeps every extracted asset at the repository root so relative
asset references continue to resolve exactly as they did from index.html.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
STYLE_PATTERN = re.compile(r"<style(?P<attrs>[^>]*)>(?P<body>.*?)</style>", re.I | re.S)
SCRIPT_PATTERN = re.compile(r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>", re.I | re.S)


def write_asset(name: str, body: str) -> None:
    content = body.strip("\n") + "\n"
    (ROOT / name).write_text(content, encoding="utf-8")


def css_boundaries(source: str) -> list[int]:
    boundaries: list[int] = []
    depth = 0
    index = 0
    quote = ""
    in_comment = False
    escaped = False

    while index < len(source):
        char = source[index]
        nxt = source[index + 1] if index + 1 < len(source) else ""

        if in_comment:
            if char == "*" and nxt == "/":
                in_comment = False
                index += 2
                continue
            index += 1
            continue

        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            index += 1
            continue

        if char == "/" and nxt == "*":
            in_comment = True
            index += 2
            continue
        if char in ("'", '"'):
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth = max(0, depth - 1)
            if depth == 0:
                boundary = index + 1
                while boundary < len(source) and source[boundary] in " \t\r\n":
                    boundary += 1
                boundaries.append(boundary)
        index += 1

    return sorted(set(boundaries))


def split_css(source: str, target_chars: int = 90_000) -> list[str]:
    if len(source) <= target_chars:
        return [source]

    boundaries = css_boundaries(source)
    chunks: list[str] = []
    start = 0
    while len(source) - start > target_chars:
        desired = start + target_chars
        candidates = [value for value in boundaries if start + target_chars // 2 <= value <= desired + target_chars // 2]
        if not candidates:
            break
        end = min(candidates, key=lambda value: abs(value - desired))
        chunks.append(source[start:end])
        start = end
    chunks.append(source[start:])
    return [chunk for chunk in chunks if chunk.strip()]


def check_js(node: str, source: str) -> bool:
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as handle:
        handle.write(source)
        temporary = handle.name
    try:
        result = subprocess.run(
            [node, "--check", temporary],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return result.returncode == 0
    finally:
        Path(temporary).unlink(missing_ok=True)


def js_candidates(source: str) -> list[int]:
    strong = re.compile(
        r"(?m)^//\s*(?:(?:[=═─]{3,})|(?:[A-Z][A-Z0-9 &/().,'’+\-:]{5,}$))"
    )
    candidates = [match.start() for match in strong.finditer(source)]
    if len(candidates) < 8:
        candidates = [match.start() for match in re.finditer(r"(?m)^//", source)]
    return candidates


def split_js(source: str, node: str, target_chars: int = 150_000) -> list[str]:
    if not check_js(node, source):
        raise RuntimeError("The original inline application script does not pass Node syntax validation")

    chunks: list[str] = []
    remaining = source
    while len(remaining) > target_chars * 1.45:
        desired = target_chars
        candidates = [
            value
            for value in js_candidates(remaining)
            if target_chars * 0.55 <= value <= target_chars * 1.55
        ]
        candidates.sort(key=lambda value: abs(value - desired))

        split_at = None
        for candidate in candidates:
            before = remaining[:candidate]
            after = remaining[candidate:]
            if check_js(node, before) and check_js(node, after):
                split_at = candidate
                break

        if split_at is None:
            break
        chunks.append(remaining[:split_at])
        remaining = remaining[split_at:]

    chunks.append(remaining)
    if any(not check_js(node, chunk) for chunk in chunks):
        raise RuntimeError("One or more generated JavaScript modules failed syntax validation")
    return [chunk for chunk in chunks if chunk.strip()]


def link_tag(name: str, element_id: str = "") -> str:
    id_attribute = f' id="{element_id}"' if element_id else ""
    return f'<link rel="stylesheet"{id_attribute} href="{name}?v=20260827-1">'


def script_tag(name: str) -> str:
    return f'<script src="{name}?v=20260827-1"></script>'


def modularize(node: str) -> list[str]:
    html = INDEX.read_text(encoding="utf-8")
    generated: list[str] = []

    style_names = {
        1: "app-shell",
        2: "app-boot",
        3: "app-jelix",
        4: "app-dark-theme",
        5: "app-job-command-center",
    }
    style_index = 0

    def replace_style(match: re.Match[str]) -> str:
        nonlocal style_index
        style_index += 1
        if style_index not in style_names:
            return match.group(0)
        attrs = match.group("attrs")
        element_match = re.search(r'\bid=["\']([^"\']+)', attrs)
        element_id = element_match.group(1) if element_match else ""
        chunks = split_css(match.group("body"))
        tags: list[str] = []
        for chunk_index, chunk in enumerate(chunks, 1):
            suffix = f"-{chunk_index:02d}" if len(chunks) > 1 else ""
            name = f"{style_names[style_index]}{suffix}.css"
            write_asset(name, chunk)
            generated.append(name)
            tags.append(link_tag(name, element_id if chunk_index == 1 else ""))
        return "\n".join(tags)

    html = STYLE_PATTERN.sub(replace_style, html)

    script_index = 0
    simple_scripts = {
        5: "pwa-runtime.js",
        6: "jelix-auto-scheduler.js",
        7: "ui-runtime.js",
        12: "mobile-viewport.js",
    }

    def replace_script(match: re.Match[str]) -> str:
        nonlocal script_index
        script_index += 1
        attrs = match.group("attrs")
        body = match.group("body")
        if "src=" in attrs.lower() or script_index in (1, 2):
            return match.group(0)
        if script_index == 4:
            prelude_functions = [
                "function debounce(fn,ms){\n  let t=null;\n  return function(...args){clearTimeout(t);t=setTimeout(()=>fn.apply(this,args),ms||1000);};\n}",
                "function localDateStr(d){\n  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');\n  return y+'-'+m+'-'+day;\n}",
            ]
            for function_source in prelude_functions:
                if function_source not in body:
                    raise RuntimeError("Expected shared prelude function was not found")
                body = body.replace(function_source, "", 1)
            write_asset("app-prelude.js", "\n\n".join(prelude_functions))
            generated.append("app-prelude.js")
            chunks = split_js(body, node)
            tags: list[str] = [script_tag("app-prelude.js")]
            for chunk_index, chunk in enumerate(chunks, 1):
                name = f"app-part-{chunk_index:02d}.js"
                write_asset(name, chunk)
                generated.append(name)
                tags.append(script_tag(name))
            return "\n".join(tags)
        if script_index in simple_scripts:
            name = simple_scripts[script_index]
            write_asset(name, body)
            generated.append(name)
            return script_tag(name)
        return match.group(0)

    html = SCRIPT_PATTERN.sub(replace_script, html)
    INDEX.write_text(html, encoding="utf-8")
    return generated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--node", default=os.environ.get("NODE_BIN") or shutil.which("node"))
    args = parser.parse_args()
    if not args.node:
        raise SystemExit("Node.js is required. Pass its path with --node.")

    generated = modularize(args.node)
    print(f"Generated {len(generated)} assets:")
    for name in generated:
        path = ROOT / name
        print(f"  {name}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
