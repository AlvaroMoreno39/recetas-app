const RECIPES_JSON_URL = 'assets/data/recipes.json';

const state = {
  recipes: [],
  filters: {
    query: '',
    type: 'all',
    profile: 'all',
    duration: 'all',
    difficulty: 'all',
    sort: 'updated_desc',
  },
};

const el = {
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  searchInput: document.getElementById('searchInput'),
  typeFilter: document.getElementById('typeFilter'),
  profileFilter: document.getElementById('profileFilter'),
  timeFilter: document.getElementById('timeFilter'),
  difficultyFilter: document.getElementById('difficultyFilter'),
  sortSelect: document.getElementById('sortSelect'),
  activeFilters: document.getElementById('activeFilters'),
  resultsLabel: document.getElementById('resultsLabel'),
  btnClearFilters: document.getElementById('btnClearFilters'),
  detailTitle: document.getElementById('detailTitle'),
  detailBody: document.getElementById('detailBody'),
  cardTpl: document.getElementById('cardTpl'),
};

window.addEventListener('DOMContentLoaded', startApp);

async function startApp() {
  try {
    await init();
  } catch (error) {
    el.resultsLabel.textContent = 'No se pudo cargar el catálogo. Recarga la página para volver a intentarlo.';
    console.error('[recetas-app] init_error', error);
  }
}

async function init() {
  state.recipes = await loadRecipes();
  bindEvents();
  renderTypeFilter();
  renderChips();
  renderRecipes();
  route();
}

function bindEvents() {
  const updateSearch = (value) => {
    state.filters.query = safeString(value);
    renderRecipes();
  };

  if (el.searchInput) {
    el.searchInput.addEventListener('input', (event) => updateSearch(event.target.value));
  }

  const filterBox = document.querySelector('#filterBox');
  const controls = {
    type: el.typeFilter, duration: el.timeFilter, profile: el.profileFilter,
    difficulty: el.difficultyFilter, sort: el.sortSelect,
  };
  document.querySelector('#filters').onclick = () => {
    for (const [key, select] of Object.entries(controls)) select.value = state.filters[key];
    filterBox.showModal();
  };
  filterBox.addEventListener('close', () => document.querySelector('#filters').focus({preventScroll: true}));
  document.querySelector('#applyFilters').onclick = () => {
    for (const [key, select] of Object.entries(controls)) state.filters[key] = select.value;
    renderRecipes();
    filterBox.close();
  };
  document.querySelector('#resetFilters').onclick = () => {
    clearFilters();
    filterBox.close();
  };
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.querySelector('[data-dismiss]').onclick = () => dialog.close();
    function outside(event) {
      const box = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < box.left || event.clientX >= box.right ||
        event.clientY < box.top || event.clientY >= box.bottom);
    }
    let startedOutside = false;
    dialog.addEventListener('pointerdown', event => { startedOutside = outside(event); });
    dialog.addEventListener('click', event => {
      if (startedOutside && outside(event)) dialog.close();
      startedOutside = false;
    });
  }
  if (el.btnClearFilters) {
    el.btnClearFilters.addEventListener('click', clearFilters);
  }

  document.addEventListener('keydown', (event) => {
    if (shouldIgnoreShortcut(event.target)) return;
    if (event.key === '/' && !document.querySelector('dialog[open]') && !document.querySelector('.container').hidden && el.searchInput) {
      event.preventDefault();
      el.searchInput.focus();
    }
  });
}

async function loadRecipes() {
  const response = await fetch(RECIPES_JSON_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error('No se pudo leer recipes.json');
  const catalog = await response.json();
  if (!Array.isArray(catalog)) throw new Error('Formato de catálogo desconocido');
  return catalog.map(item => {
    const recipe = normalizeRecipe(item);
    recipe.searchText = searchableText(recipe);
    return recipe;
  });

}

function normalizeRecipe(item) {
  const inferredType = safeString(item.type || item.category);
  const inferredProfile = safeString(item.profile || inferProfileFromLegacy(item));
  const inferredDifficulty = safeString(item.difficulty || inferDifficultyFromLegacy(item));
  const variants = Array.isArray(item.variants) ? item.variants.map(normalizeVariant).filter(Boolean) : [];
  const images = normalizeImageList(item.images, item.image);

  return {
    ...item,
    id: typeof item.id === 'string' ? item.id : createId(),
    tags: Array.isArray(item.tags) ? item.tags : [],
    title: safeString(item.title),
    type: inferredType || 'General',
    profile: normalizeProfile(inferredProfile),
    difficulty: normalizeDifficulty(inferredDifficulty),
    prepTime: positiveNumberOrNull(item.prepTime),
    image: images[0] || '',
    images,
    yields: safeString(item.yields),
    times: item.times || {},
    ingredients: Array.isArray(item.ingredients) ? item.ingredients.map(safeString).filter(Boolean) : [],
    steps: Array.isArray(item.steps) ? item.steps.map(safeString).filter(Boolean) : [],
    notes: safeString(item.notes),
    variants,
    updatedAt: safeString(item.updatedAt) || new Date().toISOString(),
  };
}

function normalizeVariant(item) {
  if (!item || typeof item !== 'object') return null;
  const images = normalizeImageList(item.images, item.image);

  return {
    ...item,
    id: typeof item.id === 'string' ? item.id : createId(),
    label: safeString(item.label) || 'Version',
    title: safeString(item.title),
    difficulty: normalizeDifficulty(item.difficulty),
    prepTime: positiveNumberOrNull(item.prepTime),
    image: images[0] || '',
    images,
    summary: safeString(item.summary),
    learns: Array.isArray(item.learns) ? item.learns.map(safeString).filter(Boolean) : [],
    yields: safeString(item.yields),
    times: item.times || {},
    ingredients: Array.isArray(item.ingredients) ? item.ingredients.map(safeString).filter(Boolean) : [],
    steps: Array.isArray(item.steps) ? item.steps.map(safeString).filter(Boolean) : [],
  };
}

function searchableText(recipe) {
  return normalizeText(
      [
        recipe.title,
        recipe.type,
        recipe.profile,
        recipe.difficulty,
        recipe.notes,
        (recipe.tags || []).join(' '),
        recipe.ingredients.join(' '),
        recipe.steps.join(' '),
        recipe.variants.map((variant) => [variant.label, variant.title, variant.summary, variant.learns.join(' '), variant.ingredients.join(' '), variant.steps.join(' ')].join(' ')).join(' '),
      ].join(' ')
    );
}

function getProcessedRecipes() {
  const tokens = normalizeText(state.filters.query).split(' ').filter(Boolean);

  const filtered = state.recipes.filter((recipe) => {
    const detailSets = getRecipeDetailSets(recipe);
    const matchesType = state.filters.type === 'all' || recipe.type === state.filters.type;
    const matchesDuration =
      state.filters.duration === 'all' ||
      detailSets.some((detail) => matchesDurationFilter(detail.prepTime, state.filters.duration));
    const matchesProfile = state.filters.profile === 'all' || recipe.profile === state.filters.profile;
    const matchesDifficulty =
      state.filters.difficulty === 'all' ||
      detailSets.some((detail) => normalizeDifficulty(detail.difficulty) === state.filters.difficulty);

    const matchesQuery = tokens.every((token) => recipe.searchText.includes(token));
    return matchesType && matchesDuration && matchesProfile && matchesDifficulty && matchesQuery;
  });

  return sortRecipes(filtered, state.filters.sort);
}

function renderRecipes() {
  if (!el.grid) return;

  const list = getProcessedRecipes();
  const fragment = document.createDocumentFragment();

  for (const chip of document.querySelectorAll('#chips button')) {
    chip.setAttribute('aria-pressed', chip.value === state.filters.type);
  }
  el.grid.innerHTML = '';
  if (el.empty) el.empty.hidden = list.length > 0;

  list.forEach((recipe, index) => {
    const primaryDetail = getPrimaryDetail(recipe);
    const isProgressiveRecipe = Array.isArray(recipe.variants) && recipe.variants.length > 0;
    const node = createCardNode();
    if (!node) return;

    node.href = recipeLink(recipe.id);
    const thumb = node.querySelector('.thumb');
    thumb.loading = index === 0 ? 'eager' : 'lazy';
    if (index === 0) thumb.fetchPriority = 'high';
    setPhoto(thumb, recipe.image, recipe.title,
      '(max-width: 639px) 92vw, (max-width: 999px) 45vw, (max-width: 1399px) 30vw, (max-width: 1659px) 23vw, 370px');

    const title = node.querySelector('.title');
    if (title) title.textContent = recipe.title;

    const tagType = node.querySelector('.tag-type');
    setTagContent(tagType, recipe.type);

    const tagDuration = node.querySelector('.tag-duration');
    setTagContent(tagDuration, isProgressiveRecipe ? '' : (primaryDetail.prepTime ? formatTime(primaryDetail.prepTime) : ''));

    const tagProfile = node.querySelector('.tag-profile');
    setTagContent(tagProfile, (recipe.variants.length ? recipe.variants.length + " variantes" : ""));

    const desc = node.querySelector('.desc');
    if (desc) desc.textContent = buildCardDescription(recipe);

    fragment.append(node);
  });

  el.grid.append(fragment);
  updateStatus(list.length);
  renderActiveFilters();
}

function renderChips() {
  document.querySelector('#chips').replaceChildren(
    ...Array.from(el.typeFilter.options, (option) => {
      const button = document.createElement("button");
      button.textContent = option.text;
      button.value = option.value;
      button.setAttribute("aria-pressed", option.value === state.filters.type);
      button.onclick = () => {
        el.typeFilter.value = option.value;
        state.filters.type = option.value;
        renderRecipes();
      };
      return button;
    }),
  );
}

function renderTypeFilter() {
  if (!el.typeFilter) return;

  const types = [...new Set(state.recipes.map((item) => item.type))].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );

  el.typeFilter.innerHTML = '<option value="all">Todas</option>';
  types.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    el.typeFilter.append(option);
  });

  el.typeFilter.value = 'all';
}

function renderActiveFilters() {
  if (!el.activeFilters) return;

  const chips = [];
  if (state.filters.query) chips.push(state.filters.query);
  if (state.filters.type !== 'all') chips.push(state.filters.type);
  if (state.filters.duration !== 'all' && el.timeFilter) chips.push(el.timeFilter.selectedOptions[0].textContent);
  if (state.filters.profile !== 'all') chips.push(formatProfile(state.filters.profile));
  if (state.filters.difficulty !== 'all' && el.difficultyFilter) {
    chips.push(el.difficultyFilter.selectedOptions[0].textContent);
  }
  if (state.filters.sort !== 'updated_desc' && el.sortSelect) chips.push(el.sortSelect.selectedOptions[0].textContent);

  el.activeFilters.innerHTML = '';
  chips.forEach((chip) => {
    const span = document.createElement('span');
    span.className = 'filter-chip';
    span.textContent = chip;
    el.activeFilters.append(span);
  });
}

function updateStatus(count) {
  if (el.resultsLabel) {
    el.resultsLabel.textContent = `${count} ${count === 1 ? 'receta' : 'recetas'}`;
  }

  if (el.btnClearFilters) {
    el.btnClearFilters.hidden = !hasActiveFilters();
  }
}

function hasActiveFilters() {
  return (
    Boolean(state.filters.query) ||
    state.filters.type !== 'all' ||
    state.filters.duration !== 'all' ||
    state.filters.profile !== 'all' ||
    state.filters.difficulty !== 'all' ||
    state.filters.sort !== 'updated_desc'
  );
}

function buildCardDescription(recipe) {
  if (Array.isArray(recipe.variants) && recipe.variants.length > 0) {
    return truncate(recipe.notes || `Incluye ${recipe.variants.length} versiones para avanzar paso a paso.`, 110);
  }
  const description = safeString(recipe.notes);
  if (description) return truncate(description, 110);

  const firstStep = safeString(recipe.steps[0]);
  if (firstStep) return truncate(firstStep, 110);

  return truncate(recipe.ingredients.slice(0, 3).join(', '), 110) || 'Sin descripcion';
}

function clearFilters() {
  state.filters.query = '';
  state.filters.type = 'all';
  state.filters.duration = 'all';
  state.filters.profile = 'all';
  state.filters.difficulty = 'all';
  state.filters.sort = 'updated_desc';

  if (el.searchInput) el.searchInput.value = '';
  if (el.typeFilter) el.typeFilter.value = 'all';
  if (el.timeFilter) el.timeFilter.value = 'all';
  if (el.profileFilter) el.profileFilter.value = 'all';
  if (el.difficultyFilter) el.difficultyFilter.value = 'all';
  if (el.sortSelect) el.sortSelect.value = 'updated_desc';

  renderRecipes();
}

function getPrimaryDetail(recipe) {
  return Array.isArray(recipe.variants) ? recipe.variants[0] || recipe : recipe;
}

function getRecipeDetailSets(recipe) {
  return Array.isArray(recipe.variants) && recipe.variants.length > 0 ? recipe.variants : [recipe];
}

function getDetailImages(recipe, variant) {
  const candidateList = Array.isArray(variant?.images) && variant.images.length > 0 ? variant.images : recipe.images;
  return Array.isArray(candidateList) && candidateList.length > 0 ? candidateList : [recipe.image || createPlaceholderImage(recipe.title)];
}

function setTagContent(element, value) {
  if (!element) return;
  const content = safeString(value);
  element.hidden = !content;
  element.textContent = content;
}

function sortRecipes(recipes, mode) {
  const list = [...recipes];

  switch (mode) {
    case 'updated_asc':
      return list.sort((a, b) => dateValue(a.updatedAt) - dateValue(b.updatedAt));
    case 'title_asc':
      return list.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
    case 'title_desc':
      return list.sort((a, b) => b.title.localeCompare(a.title, 'es', { sensitivity: 'base' }));
    case 'prep_asc':
      return list.sort((a, b) => prepValue(a.prepTime) - prepValue(b.prepTime));
    case 'prep_desc':
      return list.sort((a, b) => prepValue(b.prepTime) - prepValue(a.prepTime));
    case 'updated_desc':
    default:
      return list.sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));
  }
}

function prepValue(value) {
  return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
}

function dateValue(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeString(value) {
  return String(value ?? '').trim();
}

function positiveNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeText(value) {
  return safeString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function truncate(text, maxLen) {
  const clean = safeString(text);
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 3).trim()}...`;
}

function normalizeProfile(value) {
  const normalized = safeString(value).toLowerCase();
  if (normalized === 'dulce' || normalized === 'salado' || normalized === 'mixto') return normalized;
  if (normalized === 'media') return 'mixto';
  if (normalized === 'bizcocho' || normalized === 'postre') return 'dulce';
  return 'salado';
}

function formatProfile(value) {
  const normalized = normalizeProfile(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function inferProfileFromLegacy(item) {
  const profile = safeString(item.profile).toLowerCase();
  if (profile) return profile;

  const category = safeString(item.category || item.type).toLowerCase();
  if (category.includes('postre') || category.includes('dulce') || category.includes('bizcocho')) return 'dulce';

  return 'salado';
}

function normalizeDifficulty(value) {
  const normalized = safeString(value).toLowerCase();
  if (normalized === 'baja' || normalized === 'media' || normalized === 'alta') return normalized;
  return 'media';
}

function formatDifficulty(value) {
  const normalized = normalizeDifficulty(value);
  if (normalized === 'baja') return 'Sencilla';
  if (normalized === 'media') return 'Técnica';
  if (normalized === 'alta') return 'Experta';
  return 'Técnica';
}

function inferDifficultyFromLegacy(item) {
  const difficulty = safeString(item.difficulty).toLowerCase();
  if (difficulty) return difficulty;

  const prepTime = positiveNumberOrNull(item.prepTime);
  if (!prepTime) return 'media';
  if (prepTime <= 30) return 'baja';
  if (prepTime <= 60) return 'media';
  return 'alta';
}

function matchesDurationFilter(prepTime, mode) {
  const hasTime = Number.isFinite(prepTime) && prepTime > 0;
  if (mode === 'all') return true;
  if (mode === 'unknown') return !hasTime;
  if (!hasTime) return false;
  if (mode === 'short') return prepTime <= 30;
  if (mode === 'medium') return prepTime >= 31 && prepTime <= 60;
  if (mode === 'long') return prepTime > 60;
  return true;
}

function normalizeImageUrl(raw) {
  const value = safeString(raw);
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  if (url.protocol === 'http:') {
    url.protocol = 'https:';
  }

  const host = url.hostname.toLowerCase();

  if (host.includes('google.') && url.searchParams.has('imgurl')) {
    const fromQuery = safeString(url.searchParams.get('imgurl'));
    if (fromQuery) return normalizeImageUrl(fromQuery);
  }

  if (host === 'images.app.goo.gl') {
    return '';
  }

  return url.toString();
}

function normalizeImageList(items, fallback) {
  const fromArray = Array.isArray(items) ? items.map(normalizeImageUrl).filter(Boolean) : [];
  const fallbackImage = normalizeImageUrl(fallback);
  if (fromArray.length > 0) return fromArray;
  return fallbackImage ? [fallbackImage] : [];
}

function escapeHtml(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span.innerHTML;
}

function createPlaceholderImage(title) {
  const initials = safeString(title).slice(0, 2).toUpperCase() || 'RC';
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'>
      <rect width='100%' height='100%' fill='#F3EEE6'/>
      <text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' fill='#766F65' font-family='Georgia, serif' font-size='88' font-weight='700'>${escapeHtml(
        initials
      )}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function shouldIgnoreShortcut(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();

  const pattern = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return pattern.replace(/[xy]/g, (char) => {
    const rnd = Math.floor(Math.random() * 16);
    const val = char === 'x' ? rnd : (rnd & 0x3) | 0x8;
    return val.toString(16);
  });
}

function createCardNode() {
  return el.cardTpl.content.firstElementChild.cloneNode(true);
}

function setPhoto(img, src, title, sizes) {
  img.alt = title;
  img.draggable = false;
  img.decoding = 'async';
  if (src?.startsWith('assets/images/responsive/commons/') && src.endsWith('-960.webp')) {
    img.sizes = sizes;
    img.srcset = src.replace('-960.webp', '-480.webp') + ' 480w, ' + src + ' 960w';
  }
  img.onerror = () => {
    if (img.hasAttribute('srcset')) {
      img.removeAttribute('srcset');
      img.src = src;
    } else {
      img.onerror = null;
      img.src = createPlaceholderImage(title);
    }
  };
  img.src = src || createPlaceholderImage(title);
}

function formatTime(minutes) {
  if (minutes % 1440 === 0) return minutes / 1440 + (minutes === 1440 ? ' día' : ' días');
  if (minutes < 60) return minutes + ' min';
  return Math.floor(minutes / 60) + ' h' + (minutes % 60 ? ' ' + minutes % 60 + ' min' : '');
}
