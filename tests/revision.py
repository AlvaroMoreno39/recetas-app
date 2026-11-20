"""Run with Python, Playwright and Chromium: python tests/revision.py"""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from shutil import which
from threading import Thread
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=root))
Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/"
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=which("chromium"), args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("dialog", lambda dialog: dialog.accept())
    page.goto(url, wait_until="domcontentloaded")
    page.locator(".card").first.wait_for()
    assert page.locator(".card").count() == 8
    assert page.evaluate("decimal(12500) === '12500' && measurement('1/2 l leche') === null")
    for width in [320, 375, 430, 768]:
        page.set_viewport_size({"width": width, "height": 812})
        page.goto(url + "#/recetas/focaccia-artesanal?variante=focaccia-nivel-2")
        assert page.locator(".container").is_hidden()
        assert page.locator(".variant-switcher button[aria-pressed=true]").count() == 1
        page.locator("[data-item]").first.check()
        page.locator("[data-act=cook]").tap()
        page.locator("#manual input").fill("2")
        page.locator("#manual button").tap()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.locator('[data-act="pause:0"]').focus()
        page.wait_for_timeout(1100)
        assert page.evaluate('document.activeElement.dataset.act === "pause:0"')
        page.reload(wait_until="domcontentloaded")
        page.locator('[data-act="pause:0"]').tap()
        page.locator('[data-act="cancel:0"]').tap()
        page.locator('[data-act=exit]').tap()
        assert page.locator("[data-item]").first.is_checked()
    page.locator("[data-act=edit]").tap()
    assert page.locator('#versions button[aria-pressed=true]').inner_text().startswith('Nivel 2')
    page.locator('[data-act=duplicate]').tap()
    page.evaluate("""window.originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v){if(k==='recetario:edits')throw Error('quota'); window.originalSet.call(this,k,v)}; void 0""")
    page.get_by_text("Guardar receta", exact=True).tap()
    assert page.locator("#sheet").is_visible()
    page.evaluate("Storage.prototype.setItem = window.originalSet; void 0")
    page.get_by_text("Guardar receta", exact=True).tap()
    page.reload(wait_until="domcontentloaded")
    assert page.locator(".variant-switcher button").count() == 3
    page.locator("#personal").fill("Mi nota")
    page.locator("#page a").tap()
    page.locator("#page").wait_for(state="hidden")
    with page.expect_download() as download:
        page.locator("#backup").tap()
    data = json.loads(Path(download.value.path()).read_text())["entries"]
    assert "recetario:edits" in data
    assert any(json.loads(v) == "Mi nota" for v in data.values())
    assert not errors, errors
server.shutdown()
print("OK")
