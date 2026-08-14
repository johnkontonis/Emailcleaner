#!/usr/bin/env python3
"""Bundle the app into one self-contained HTML file.

    python3 scripts/build_single_file.py            # -> dist/costimator.html
    python3 scripts/build_single_file.py out.html

Inlines the stylesheet and every script, and drops the bits that need real
files alongside them (service worker, manifest, icon links). The result opens
straight from a file:// path or a USB stick with nothing else next to it.

The multi-file version in the repo root stays the one to develop against — this
is for handing someone a copy.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as fh:
        return fh.read()


def build():
    html = read("index.html")

    # Inline the stylesheet.
    css = read("css", "styles.css")
    html = re.sub(
        r'<link rel="stylesheet" href="css/styles\.css">',
        f"<style>\n{css}\n</style>",
        html,
    )

    # Inline every local script, in the order the page lists them.
    def inline_script(match):
        src = match.group(1)
        if src.startswith(("http://", "https://", "//")):
            return match.group(0)
        return f"<script>\n{read(*src.split('/'))}\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

    # These need sibling files that a single-file copy does not have.
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="icon"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', "", html)

    # Strip the service-worker registration block.
    html = re.sub(
        r"<script>(?:(?!</script>).)*?'serviceWorker'.*?</script>",
        "",
        html,
        flags=re.DOTALL,
    )

    if "src=" in re.sub(r"<img[^>]*>", "", html):
        print("warning: a script src survived inlining", file=sys.stderr)

    return html


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "dist", "roost.html")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    html = build()
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"wrote {out} ({len(html) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
