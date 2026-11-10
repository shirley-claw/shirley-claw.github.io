# shirley-claw.github.io

Tiny web tools, toys and experiments, served by GitHub Pages at <https://shirley-claw.github.io/>.

## Add an app

1. Put a self-contained page at `<slug>/index.html` plus a `<slug>/thumb.png` screenshot (16:9-ish).
2. Add an entry to `apps.json` (`section` is `useful`, `fun` or `random`; write a real `description`, which becomes the Google snippet).
3. Run `python3 build.py`. It rewrites `index.html` and `sitemap.xml`, and injects the SEO `<head>` block and the "more toys" badge into each app between `seo:`/`badge:` marker comments.
4. Commit and push.

New apps go straight onto the homepage; there is no unlisted drafts stage.
