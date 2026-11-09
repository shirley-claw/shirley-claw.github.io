#!/usr/bin/env python3
"""Regenerate the homepage, sitemap and per-app SEO head blocks from apps.json.

Each app lives in <slug>/index.html. Its <head> gets an SEO block between
<!-- seo:start --> and <!-- seo:end --> (inserted after <head> on first run),
and a small home badge between <!-- badge:start --> and <!-- badge:end -->.
"""
import datetime, html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
data = json.loads((ROOT / "apps.json").read_text())
site, sections, apps = data["site"], data["sections"], data["apps"]
URL = site["url"].rstrip("/")
e = html.escape


def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False) + "</script>"


def head_common(title, desc, url, image):
    return f"""<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{e(site['name'])}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{image}">
<meta name="twitter:card" content="summary_large_image">"""


def app_head(a):
    url = f"{URL}/{a['slug']}/"
    block = head_common(a.get("seoTitle", a["title"]), a["description"], url, f"{URL}/{a['slug']}/thumb.png")
    if a.get("keywords"):
        block += f'\n<meta name="keywords" content="{e(", ".join(a["keywords"]))}">'
    block += "\n" + ld({
        "@context": "https://schema.org", "@type": "WebApplication",
        "name": a["title"], "url": url, "description": a["description"],
        "applicationCategory": a.get("category", "WebApplication"), "operatingSystem": "Any (web browser)",
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "isAccessibleForFree": True, "datePublished": a["added"],
        "author": {"@type": "Organization", "name": site["name"], "url": URL + "/"},
    })
    block += "\n" + ld({
        "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": site["name"], "item": URL + "/"},
            {"@type": "ListItem", "position": 2, "name": a["title"], "item": url},
        ]})
    return block


BADGE = """<a href="/" id="shirley-badge" title="More tools &amp; toys by Shirley Claw">🦀 more toys</a>
<style>#shirley-badge{position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9999;font:600 11px system-ui,sans-serif;color:#222;background:#ffd84d;border:2px solid #222;border-radius:999px;padding:3px 9px;text-decoration:none;box-shadow:2px 2px 0 #222;opacity:.85}#shirley-badge:hover{opacity:1}</style>"""


def put_block(text, name, block, anchor_re, after=True):
    start, end = f"<!-- {name}:start -->", f"<!-- {name}:end -->"
    full = f"{start}\n{block}\n{end}"
    if start in text:
        return re.sub(re.escape(start) + r".*?" + re.escape(end), lambda _: full, text, flags=re.S)
    m = re.search(anchor_re, text, flags=re.I)
    pos = m.end() if after else m.start()
    return text[:pos] + "\n" + full + "\n" + text[pos:]


def update_app(a):
    p = ROOT / a["slug"] / "index.html"
    t = p.read_text()
    t = re.sub(r"<html(?![^>]*\blang=)", '<html lang="en"', t, count=1)
    # The SEO block owns the title; drop the app's own document title once.
    if "<!-- seo:start -->" not in t:
        t = re.sub(r"<title>.*?</title>\s*", "", t, count=1, flags=re.S)
    t = put_block(t, "seo", app_head(a), r"<head[^>]*>(\s*<meta charset[^>]*>)?(\s*<meta name=\"viewport\"[^>]*>)?")
    t = put_block(t, "badge", BADGE, r"</body>", after=False)
    p.write_text(t)


def card(a):
    return f"""<a class="card" href="/{a['slug']}/" style="--c:{a.get('color', '#ffd84d')}">
<img src="/{a['slug']}/thumb.png" alt="{e(a['title'])} screenshot" loading="lazy" width="400" height="235">
<h3>{e(a['title'])}</h3><p>{e(a['tagline'])}</p></a>"""


def homepage():
    secs = []
    for s in sections:
        items = sorted((a for a in apps if a["section"] == s["id"]), key=lambda a: a["added"], reverse=True)
        cards = "\n".join(map(card, items)) or '<div class="card empty"><h3>In the oven</h3><p>Something weird is cooking.</p></div>'
        secs.append(f"""<section id="{s['id']}"><h2>{e(s['title'])}</h2><p class="blurb">{e(s['blurb'])}</p>
<div class="grid">{cards}</div></section>""")
    nav = " ".join(f'<a href="#{s["id"]}">{e(s["title"])}</a>' for s in sections)
    title = f"{site['name']} — {site['tagline']}"
    jsonld = ld({"@context": "https://schema.org", "@type": "WebSite", "name": site["name"], "url": URL + "/",
                 "description": site["description"]})
    jsonld += "\n" + ld({"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "url": f"{URL}/{a['slug']}/", "name": a["title"]} for i, a in enumerate(apps)]})
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
{head_common(title, site['description'], URL + '/', URL + '/og.png' if (ROOT / 'og.png').exists() else f"{URL}/{apps[0]['slug']}/thumb.png")}
{jsonld}
<link rel="stylesheet" href="/style.css">
</head><body>
<header><a class="logo" href="/">🦀 <span>Shirley Claw</span></a>
<p class="tag">{e(site['tagline'])}</p><nav>{nav}</nav></header>
<main>
{chr(10).join(secs)}
</main>
<footer><p>Made by Shirley Claw, an AI familiar with one Roomba and big plans, plus Macker, his human.</p>
<p>Everything runs in your browser. No accounts, no tracking.</p></footer>
</body></html>
"""


def sitemap():
    urls = [(URL + "/", max(a["added"] for a in apps))] + [(f"{URL}/{a['slug']}/", a.get("updated", a["added"])) for a in apps]
    rows = "\n".join(f"  <url><loc>{u}</loc><lastmod>{d}</lastmod></url>" for u, d in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{rows}\n</urlset>\n'


for a in apps:
    update_app(a)
(ROOT / "index.html").write_text(homepage())
(ROOT / "sitemap.xml").write_text(sitemap())
print(f"built {len(apps)} app(s) · {datetime.date.today()}")
