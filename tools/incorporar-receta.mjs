import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const catalogUrl = new URL('../assets/data/recipes.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogUrl, 'utf8'));
const file = process.argv[2];
if (!file) throw new Error('Indica la ruta del archivo JSON descargado.');
const recipe = JSON.parse(readFileSync(file, 'utf8'));
function validDetail(detail) {
  return detail && typeof detail.id === 'string' && detail.id.trim() &&
    [detail.ingredients, detail.steps].every(list =>
      Array.isArray(list) && list.every(line => typeof line === 'string'));
}
const variants = recipe?.variants ?? [];
if (!validDetail(recipe) || typeof recipe.title !== 'string' || !recipe.title.trim() ||
    !Array.isArray(variants) || !variants.every(validDetail) ||
    new Set(variants.map(v => v.id)).size !== variants.length) {
  throw new Error('Se esperaba una receta del editor con ID, título, ingredientes, pasos y variantes válidas.');
}
const index = catalog.findIndex(item => item.id === recipe.id);
if (index === -1) catalog.push(recipe);
else catalog[index] = recipe;
const temporary = new URL('recipes-' + randomUUID() + '.tmp', catalogUrl);
try {
  writeFileSync(temporary, JSON.stringify(catalog, null, 2) + '\n', {flag: 'wx'});
  renameSync(temporary, catalogUrl);
} finally {
  rmSync(temporary, {force: true});
}
console.log('Catálogo actualizado en tu copia de trabajo. Revisa git diff antes de publicar.');
