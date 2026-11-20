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
    catalog = json.loads((root / "assets/data/recipes.json").read_text())
    focaccia = next(recipe for recipe in catalog if recipe["id"] == "focaccia-artesanal")
    for i, variant in enumerate(focaccia["variants"]):
        page.locator(f'[data-act="variant:{i}"]').click()
        page.wait_for_function("id => active.variant.id === id", arg=variant["id"])
        assert page.locator(".columns ol li").all_text_contents() == variant["steps"]
        assert page.locator(".columns .check span").all_text_contents() == variant["ingredients"]
    assert page.locator("#newRecipe, [data-act=edit], #legacy").count() == 0
    page.locator("[data-act=shop]").click()
    page.locator("#sheet [data-dismiss]").click()
    page.evaluate("localStorage.setItem('recetario:edits', JSON.stringify({old:{title:'Inédita'}}))")
    page.locator("#personal").fill("Mi nota")
    page.locator("#page a").tap()
    page.locator("#page").wait_for(state="hidden")
    with page.expect_download() as download:
        page.locator("#backup").tap()
    data = json.loads(Path(download.value.path()).read_text())["entries"]
    assert "recetario:edits" in data
    assert any(json.loads(v) == "Mi nota" for v in data.values())
    page.reload()
    assert page.locator(".card").filter(has_text="Inédita").count() == 0
    for width, height in [(320, 480), (1440, 900)]:
        page.set_viewport_size({"width": width, "height": height})
        for dismiss in ["outside", "escape", "close"]:
            page.locator("#filters").click()
            assert page.locator("#filterBox [data-dismiss]").evaluate("b => b === document.activeElement")
            box = page.locator("#applyFilters").bounding_box()
            assert box["y"] + box["height"] <= height
            page.locator("#typeFilter").select_option(label="Pan")
            if dismiss == "outside":
                page.mouse.click(1, 1)
            elif dismiss == "escape":
                page.keyboard.press("Escape")
            else:
                page.locator("#filterBox [data-dismiss]").click()
            page.locator("#filterBox").wait_for(state="hidden")
            assert page.locator("#filters").evaluate("b => b === document.activeElement")
            assert page.locator(".card").count() == 8
        page.locator("#filters").click()
        assert page.locator("#typeFilter").input_value() == "all"
        page.locator("#typeFilter").select_option(label="Pan")
        page.locator("#applyFilters").click()
        assert 0 < page.locator(".card").count() < 8
        page.locator("#filters").click()
        page.locator("#resetFilters").click()
        assert page.locator(".card").count() == 8
        page.locator("#shopping").click()
        page.keyboard.press("Escape")
        page.locator("#sheet").wait_for(state="hidden")
    assert not errors, errors
server.shutdown()
print("OK")
