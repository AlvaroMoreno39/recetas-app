Guarda aqui las imagenes que quieras usar en la web.

Estructura recomendada:

- `assets/images/recipes/`

Ejemplo:

- archivo real: `assets/images/recipes/bizcocho-platano.jpg`
- valor en `assets/data/recipes.json`:

```json
{
  "image": "assets/images/recipes/bizcocho-platano.jpg"
}
```

Consejos:

- Usa nombres simples: minusculas, guiones y sin espacios.
- Mejor `jpg`, `png` o `webp`.
- Si cambias una imagen, haz `commit` igual que con el JSON para que se publique en GitHub Pages.

Las ocho fotografías del catálogo tienen copias WebP de 480 y 960 píxeles en `responsive/`, generadas a partir de los JPEG de `recipes/` con la orientación corregida y la proporción original. Si reemplazas uno de esos originales, regenera sus dos copias antes de publicar. Las fotos nuevas se muestran directamente desde su ruta en el JSON; para servir también sus copias adaptativas, incluye la ruta en `optimizedPhotos` en `assets/js/app.js`.
