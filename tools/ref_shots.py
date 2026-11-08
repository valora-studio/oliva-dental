"""Screenshot reference sites at several scroll depths in an isolated headless Edge.

Usage: python ref_shots.py <out_dir> <url> [<url> ...]
Writes <out_dir>/<host>_<n>.jpg for scroll depths 0, 1, 2.5, 4 viewports.
"""
import sys
import pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
DEPTHS = [0, 1, 2.5, 4]

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    for url in sys.argv[2:]:
        host = urlparse(url).hostname.replace("www.", "").split(".")[0]
        page = ctx.new_page()
        try:
            page.goto(url, wait_until="networkidle", timeout=45000)
        except Exception as e:  # slow sites: take what loaded
            print(host, "goto:", type(e).__name__)
        page.wait_for_timeout(2500)
        for n, d in enumerate(DEPTHS):
            # wheel-scroll so scroll-driven animations actually fire
            target = int(d * 900)
            cur = page.evaluate("window.scrollY")
            while cur < target - 50:
                page.mouse.wheel(0, 300)
                page.wait_for_timeout(120)
                new = page.evaluate("window.scrollY")
                if new == cur:
                    break
                cur = new
            page.wait_for_timeout(1500)
            page.screenshot(path=str(out / f"{host}_{n}.jpg"), type="jpeg", quality=70)
        print(host, "ok")
        page.close()
    browser.close()
