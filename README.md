# Mis recetas

Libro de cocina digital estático alojado en GitHub Pages. El catálogo permite buscar, filtrar y ordenar recetas. Cada ficha muestra fotografías, cantidades originales y la preparación completa de la variante seleccionada. La URL de cada variante se puede compartir.

Para añadir o modificar una receta con Codex, edita `assets/data/recipes.json` y versiona sus fotografías en `assets/images/recipes/`. Mantén los identificadores de las recetas y variantes existentes para conservar sus enlaces.

Para revisar los cambios antes de publicar, ejecuta `python -m http.server 8000` desde el repositorio y abre http://localhost:8000. La prueba de navegación se ejecuta con `python tests/revision.py` y requiere Playwright y Chromium.
