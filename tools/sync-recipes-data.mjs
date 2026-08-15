import { readFileSync, writeFileSync } from 'node:fs';

const jsonPath = new URL('../assets/data/recipes.json', import.meta.url);
const jsPath = new URL('../assets/data/recipes-data.js', import.meta.url);
const recipes = JSON.parse(readFileSync(jsonPath, 'utf8'));
const output = `window.RECIPES_DATA = ${JSON.stringify(recipes, null, 2)};\n`;
writeFileSync(jsPath, output, 'utf8');
console.log('recipes-data.js actualizado');
