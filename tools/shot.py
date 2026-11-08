"""Render the site at key scroll points.

Usage: python tools/shot.py [width=1440] [height=900]
Serves the folder on a local port, scrolls through every section and writes out/shot_<w>_<nn>.jpg
plus a contact sheet out/sheet_<w>.jpg.
"""
import functools
import http.server
import pathlib
import socketserver
import sys
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
H = int(sys.argv[2]) if len(sys.argv) > 2 else 900

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
handler.log_message = lambda *a: None
srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

# (section selector, progress inside it) — progress 0..1 of the section's scroll length
POINTS = [
    (".scrub-hero", 0.0), (".scrub-hero", 0.42), (".scrub-hero", 0.7), (".scrub-hero", 0.93),
    (".scrub-clinic", 0.3), (".scrub-clinic", 0.8),
    ("#services", 0.0), ("#services", 0.5),
    (".scrub-tech", 0.15), (".scrub-tech", 0.85),
    ("#doctors", 0.0), ("#prices", 0.0), (".reviews", 0.0), ("#book", 0.0),
]

files = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    page.goto(f"http://127.0.0.1:{port}/index.html", wait_until="networkidle")
    page.wait_for_timeout(1500)
    for n, (sel, prog) in enumerate(POINTS):
        y = page.evaluate(
            """([sel, prog]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect();
            const top = r.top + scrollY; const len = Math.max(0, el.offsetHeight - innerHeight);
            return Math.round(top + (el.classList.contains('scrub') ? len * prog : el.offsetHeight * prog)); }""",
            [sel, prog],
        )
        page.evaluate("y => { if (window.__lenis) window.__lenis.scrollTo(y, {immediate: true}); window.scrollTo(0, y); }", y)
        page.wait_for_timeout(1800)
        f = OUT / f"shot_{W}_{n:02d}.jpg"
        page.screenshot(path=str(f), type="jpeg", quality=72)
        files.append(f)
    browser.close()
srv.shutdown()

# contact sheet, 4 per row
tw = 480 if W > 800 else 200
ims = [Image.open(f) for f in files]
th = int(ims[0].height * tw / ims[0].width)
cols = 4 if W > 800 else 7
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * th), "white")
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
sheet.save(OUT / f"sheet_{W}.jpg", quality=80)
print("ok", len(files), OUT / f"sheet_{W}.jpg")
