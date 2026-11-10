#!/usr/bin/env python3
"""Upload a work-in-progress app to drafts/<slug>/ so it can be tried from a phone.

Usage: python3 draft.py <slug> <path/to/draft/index.html>

Drafts are public but unlisted: not on the homepage or in the sitemap, and
marked noindex so Google keeps ranking the real /<slug>/ page once it launches.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
slug, src = sys.argv[1], pathlib.Path(sys.argv[2])
t = src.read_text()
t = re.sub(r"\n?<!-- (seo|badge):start -->.*?<!-- \1:end -->\n?", "\n", t, flags=re.S)
t = re.sub(r'<meta name="robots"[^>]*>\s*', "", t)
t = re.sub(r"(<head[^>]*>)", r'\1\n<meta name="robots" content="noindex">', t, count=1, flags=re.I)
if "<title>" not in t:
    t = t.replace('<meta name="robots" content="noindex">', f'<meta name="robots" content="noindex">\n<title>{slug} (draft)</title>', 1)
out = ROOT / "drafts" / slug / "index.html"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(t)
print(f"https://shirley-claw.github.io/drafts/{slug}/")
