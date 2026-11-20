function recipeLink(id, variantId) {
  const path = '#/recetas/' + encodeURIComponent(id);
  return variantId ? path + '?' + new URLSearchParams({ variante: variantId }) : path;
}

function textElement(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function listSection(title, tag, lines) {
  const section = document.createElement('section');
  section.append(textElement('h2', title));
  const list = document.createElement(tag);
  for (const line of lines) list.append(textElement('li', line));
  section.append(list);
  return section;
}

function renderDetail(recipe, variant) {
  const detail = variant || recipe;
  const body = el.detailBody;
  body.replaceChildren();
  if (recipe.notes) body.append(textElement('p', recipe.notes));

  const photos = document.createElement('div');
  photos.className = 'photos';
  for (const src of getDetailImages(recipe, variant)) {
    const img = document.createElement('img');
    img.className = 'detail-img';
    img.fetchPriority = photos.childElementCount ? 'auto' : 'high';
    setPhoto(img, src, variant?.title || recipe.title, '(max-width: 1000px) 92vw, 920px');
    photos.append(img);
  }
  body.append(photos);
  if (recipe.variants.length > 1) {
    const nav = document.createElement('nav');
    nav.className = 'variant-switcher';
    nav.setAttribute('aria-label', 'Variantes de la receta');
    for (const version of recipe.variants) {
      const link = document.createElement('a');
      link.append(textElement('small', version.label), textElement('strong', version.title));
      if (version.prepTime) link.append(textElement('span', formatTime(version.prepTime)));
      link.href = recipeLink(recipe.id, version.id);
      if (version === variant) link.setAttribute('aria-current', 'page');
      nav.append(link);
    }
    body.append(nav);
  }
  if (variant?.title && recipe.variants.length === 1) body.append(textElement('h2', variant.title));
  if (variant?.summary) body.append(textElement('p', variant.summary));

  const meta = [recipe.type, formatProfile(recipe.profile), formatDifficulty(detail.difficulty),
    detail.prepTime && formatTime(detail.prepTime), detail.yields];
  for (const [name, minutes] of Object.entries(detail.times)) {
    if (minutes > 0) meta.push(name + ' · ' + minutes + ' min');
  }
  const metadata = textElement('p', meta.filter(Boolean).join(' · '));
  metadata.className = 'recipe-meta';
  body.append(metadata);


  const columns = document.createElement('div');
  columns.className = 'columns';
  columns.append(listSection('Ingredientes', 'ul', detail.ingredients),
    listSection('Preparación', 'ol', detail.steps));
  body.append(columns);
  if (detail.learns?.length) body.append(listSection('Qué aprenderás', 'ul', detail.learns));
}

function route() {
  const [path, query] = location.hash.slice(1).split('?');
  const recipe = state.recipes.find(item => path === '/recetas/' + encodeURIComponent(item.id));
  document.querySelector('.container').hidden = Boolean(recipe);
  document.querySelector('#page').hidden = !recipe;
  document.title = recipe ? recipe.title + ' · Mis recetas' : 'Mis recetas';
  if (!recipe) {
    delete el.detailTitle.dataset.recipeId;
    return;
  }
  const variantId = new URLSearchParams(query).get('variante');
  const variant = recipe.variants.find(item => item.id === variantId) || recipe.variants[0];
  const selectingVariant = el.detailTitle.dataset.recipeId === recipe.id && Boolean(variant);
  el.detailTitle.dataset.recipeId = recipe.id;
  el.detailTitle.textContent = recipe.title;
  renderDetail(recipe, variant);
  if (selectingVariant) {
    el.detailBody.querySelector('[aria-current="page"]')?.focus({preventScroll: true});
    return;
  }
  el.detailTitle.focus({preventScroll: true});
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
