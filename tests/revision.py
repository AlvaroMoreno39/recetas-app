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
    # Reading must work even when browser storage is unavailable.
    page.add_init_script("""
        for (const key of ['localStorage', 'sessionStorage']) {
          Object.defineProperty(window, key, {get() { throw Error('Unexpected storage access'); }});
        }
    """)
    page.goto(url, wait_until="domcontentloaded")
    page.locator(".card").first.wait_for()
    assert page.locator(".card").count() == 8
    catalog = json.loads((root / "assets/data/recipes.json").read_text())
    assert len(catalog) == 8
    assert page.locator("dialog").count() == 1
    page.locator("#searchInput").fill("focaccia")
    assert page.locator(".card").count() == 1
    page.locator(".card").click()
    page.locator(".variant-switcher a").last.tap()
    page.locator(".variant-switcher a:last-child[aria-current=page]").wait_for()
    assert page.locator(".variant-switcher a").last.get_attribute("aria-current") == "page"
    page.go_back()
    page.locator(".variant-switcher a:first-child[aria-current=page]").wait_for()
    page.go_forward()
    page.locator(".variant-switcher a:last-child[aria-current=page]").wait_for()
    assert page.locator(".columns li").first.evaluate("li => getComputedStyle(li).userSelect !== 'none'")
    page.locator("#page > a").click()
    assert page.locator("#searchInput").input_value() == "focaccia"
    page.locator("#searchInput").fill("")
    page.locator("#filters").click()
    page.locator("#sortSelect").select_option("title_asc")
    page.locator("#applyFilters").click()
    assert page.evaluate("""(() => {
        const titles = [...document.querySelectorAll('.card .title')].map(el => el.textContent);
        return titles.every((title,i) => !i || titles[i-1].localeCompare(title, 'es', {sensitivity:'base'}) <= 0);
    })()""")
    page.locator("#chips button").filter(has_text="Pizza").click()
    assert page.locator(".card").count() == 1
    page.locator("#chips button").filter(has_text="Todas").click()
    page.locator("#searchInput").fill("sin coincidencias xyz")
    page.locator("#empty").wait_for()
    page.locator("#btnClearFilters").click()
    page.keyboard.press("/")
    assert page.locator("#searchInput").evaluate("el => el === document.activeElement")
    for width in [320, 375, 430, 639, 640, 768, 999, 1000, 1280, 1399, 1400, 1440, 1920]:
        page.set_viewport_size({"width": width, "height": 820})
        page.goto(url)
        page.locator(".card").first.wait_for()
        grid = page.locator(".grid")
        expected_columns = 1 if width < 640 else 2 if width < 1000 else 3 if width < 1400 else 4
        assert grid.evaluate("e => getComputedStyle(e).gridTemplateColumns.split(' ').length") == expected_columns
        if width >= 1440:
            assert 1340 <= grid.bounding_box()["width"] <= 1560
        for recipe in catalog:
            for detail in recipe.get("variants") or [recipe]:
                address = url + "#/recetas/" + recipe["id"]
                if detail is not recipe:
                    address += "?variante=" + detail["id"]
                page.goto(address)
                page.wait_for_function("url => location.href === url && document.querySelectorAll('.columns ol li').length > 0", arg=address)
                if detail is not recipe:
                    page.locator(f'.variant-switcher a[aria-current="page"][href$="{detail["id"]}"]').wait_for()
                page.get_by_role("heading", name=recipe["title"], exact=True).first.wait_for()
                assert page.locator(".columns ul li").all_text_contents() == detail["ingredients"]
                assert page.locator(".columns ol li").all_text_contents() == detail["steps"]
                assert page.locator("#page input, #page textarea, #page button, #page form").count() == 0
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                page.locator(".photos img").first.evaluate("img => img.decode()")
                if width >= 1440:
                    assert page.locator("#page").bounding_box()["width"] == 1280
                    assert page.locator(".columns section").first.bounding_box()["width"] == 340
                assert "/responsive/" in page.locator(".photos img").first.evaluate("img => img.currentSrc")
    page.goto(url)
    page.locator(".card").first.wait_for()
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
    page.route("**/responsive/**/*.webp", lambda route: route.abort())
    page.goto(url + "?fallback#/recetas/focaccia-artesanal")
    page.wait_for_function("document.querySelector('.photos img')?.currentSrc.endsWith('.jpg') && document.querySelector('.photos img').naturalWidth > 0")
    page.route("**/recipes/*.jpg", lambda route: route.abort())
    page.reload()
    page.wait_for_function("document.querySelector('.photos img')?.currentSrc.startsWith('data:image/') && document.querySelector('.photos img').naturalWidth > 0")
    assert not errors, errors
server.shutdown()
print("OK")
