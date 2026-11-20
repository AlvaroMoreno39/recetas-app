"""Run with Python, Playwright and Chromium: python tests/revision.py"""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from subprocess import run
from shutil import which, copytree, copy
from threading import Thread
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
sandbox = TemporaryDirectory()
site = Path(sandbox.name)
copytree(root / "assets", site / "assets")
copytree(root / "tools", site / "tools")
copy(root / "index.html", site)
server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=site))
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
    with page.expect_download() as download:
        page.get_by_text("Descargar receta JSON", exact=True).tap()
    recipe_file = site / "descarga.json"
    download.value.save_as(recipe_file)
    page.get_by_text("Cancelar", exact=True).tap()
    assert page.locator(".variant-switcher button").count() == 2
    assert page.evaluate("localStorage.getItem('recetario:edits')") is None
    run(["node", site / "tools/incorporar-receta.mjs", recipe_file], check=True)
    page.reload(wait_until="domcontentloaded")
    page.locator(".variant-switcher button").nth(2).wait_for()
    other = browser.new_page()
    other.goto(url + "#/recetas/focaccia-artesanal")
    assert other.locator(".variant-switcher button").count() == 3
    before = json.loads((root / "assets/data/recipes.json").read_text())
    after = json.loads((site / "assets/data/recipes.json").read_text())
    assert len(before) == len(after) == 8
    for original, edited in zip(before, after):
        if original["id"] != "focaccia-artesanal":
            assert original == edited
        else:
            for old, new in zip(original["variants"], edited["variants"]):
                assert old["ingredients"] == new["ingredients"] and old["steps"] == new["steps"]
    other.goto(url)
    other.locator("#newRecipe").click()
    other.locator("#general input").first.fill("Receta de prueba")
    with other.expect_download() as download:
        other.get_by_text("Descargar receta JSON", exact=True).click()
    download.value.save_as(recipe_file)
    run(["node", site / "tools/incorporar-receta.mjs", recipe_file], check=True)
    for client in [page, other]:
        client.goto(url)
        client.locator(".card").nth(8).wait_for()
        assert client.locator(".card").count() == 9
    page.evaluate("""localStorage.setItem('recetario:edits', JSON.stringify({old:
      {id:'focaccia-artesanal',title:'Borrador antiguo'}}))""")
    page.reload()
    page.locator('#legacy summary').click()
    page.get_by_role('button', name='Borrador antiguo').click()
    assert page.locator("#general input").first.input_value() == 'Borrador antiguo'
    page.get_by_text("Cancelar", exact=True).click()
    assert page.locator(".card").filter(has_text="Borrador antiguo").count() == 0
    page.goto(url + "#/recetas/focaccia-artesanal")
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
sandbox.cleanup()
print("OK")
