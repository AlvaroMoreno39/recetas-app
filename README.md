# Mis recetas

Recetario estático alojado en GitHub Pages. La web lee `assets/data/recipes.json` al cargar. El catálogo y las fotografías de `assets/images/recipes/` se versionan en Git. Para una vista previa local, ejecuta `python -m http.server 8000` desde el repositorio y abre http://localhost:8000.

## Añadir, modificar y publicar

1. Abre **Nueva receta** o **Editar receta** en la ficha publicada. Prepara ingredientes, pasos y variantes y pulsa **Descargar receta JSON**. El archivo contiene una receta completa. Conserva su ID para actualizarla.
2. En una copia actualizada del repositorio ejecuta `node tools/incorporar-receta.mjs "/ruta/a/mi-receta.json"`. Añade la receta o actualiza la que tenga ese ID. Puedes incorporar varias descargas sucesivamente. También puedes editar directamente el array de `assets/data/recipes.json` en GitHub.
3. Para fotos nuevas, añade los archivos a `assets/images/recipes/` y usa su ruta relativa en el editor. Revisa el diff del catálogo y comprueba la vista previa. Si alguien ha editado la misma receta desde la descarga, reconcilia los cambios antes del commit.
4. Cuando quieras publicar, sube el catálogo y las imágenes a la rama que sirve Pages (actualmente `main`). Una vez finalizado el despliegue, al recargar se verá la misma receta en todos los dispositivos.

La edición se realiza en memoria hasta que descargas el archivo. Las notas, preferencias, compra y sesiones de cocina pertenecen al navegador. Si existen recetas locales creadas con la versión anterior, el pie del listado ofrece **Recuperar recetas locales anteriores** para abrir cada una como borrador y descargarla. La copia de datos personales sigue disponible por separado.
