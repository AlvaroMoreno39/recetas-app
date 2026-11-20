# Mis recetas

Recetario estático de consulta y cocina alojado en GitHub Pages. Para añadir o modificar recetas con Codex, edita `assets/data/recipes.json` y versiona las fotos en `assets/images/recipes/`. Conserva los identificadores al actualizar una receta o variante para mantener sus enlaces y preferencias.

Ejecuta `python -m http.server 8000` desde el repositorio y abre http://localhost:8000 para comprobar los cambios. Cuando quieras publicar, sube los archivos a la rama que sirve GitHub Pages.

Las marcas, cantidades, notas privadas, compra y sesiones de cocina pertenecen al navegador. El catálogo procede exclusivamente del JSON publicado. La opción «Exportar copia de mis datos» conserva también cualquier edición local de versiones anteriores. Si necesitas recuperarla, exporta la copia desde ese mismo navegador y reconcilia la entrada `recetario:edits` con el catálogo en el repositorio.
