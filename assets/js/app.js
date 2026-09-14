const RECIPES_JSON_URL = 'assets/data/recipes.json?v=20260815b';

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
  detailDialog: document.getElementById('detailDialog'),
  detailTitle: document.getElementById('detailTitle'),
  detailBody: document.getElementById('detailBody'),
  cardTpl: document.getElementById('cardTpl'),
};

void startApp();

async function startApp() {
  try {
    await init();
  } catch (error) {
    console.error('[recetas-app] init_error', error);
  }
}

async function init() {
  state.recipes = await loadRecipes();
  bindEvents();
  renderTypeFilter();
  renderRecipes();
}

function bindEvents() {
  const updateSearch = debounce((value) => {
    state.filters.query = safeString(value);
    renderRecipes();
  }, 140);

  if (el.searchInput) {
    el.searchInput.addEventListener('input', (event) => updateSearch(event.target.value));
  }

  if (el.typeFilter) {
    el.typeFilter.addEventListener('change', (event) => {
      state.filters.type = event.target.value;
      renderRecipes();
    });
  }

  if (el.timeFilter) {
    el.timeFilter.addEventListener('change', (event) => {
      state.filters.duration = event.target.value;
      renderRecipes();
    });
  }

  if (el.profileFilter) {
    el.profileFilter.addEventListener('change', (event) => {
      state.filters.profile = event.target.value;
      renderRecipes();
    });
  }

  if (el.difficultyFilter) {
    el.difficultyFilter.addEventListener('change', (event) => {
      state.filters.difficulty = event.target.value;
      renderRecipes();
    });
  }

  if (el.sortSelect) {
    el.sortSelect.addEventListener('change', (event) => {
      state.filters.sort = event.target.value;
      renderRecipes();
    });
  }

  if (el.btnClearFilters) {
    el.btnClearFilters.addEventListener('click', clearFilters);
  }

  document.querySelectorAll('[data-close-detail]').forEach((button) => {
    button.addEventListener('click', closeDetail);
  });

  if (el.grid) {
    el.grid.addEventListener('click', onGridClick);
  }

  document.addEventListener('keydown', (event) => {
    if (shouldIgnoreShortcut(event.target)) return;
    if (event.key === '/' && el.searchInput) {
      event.preventDefault();
      el.searchInput.focus();
    }
  });
}

async function loadRecipes() {
  const bundledRecipes = Array.isArray(window.RECIPES_DATA) ? window.RECIPES_DATA : null;
  if (bundledRecipes?.length) {
    return bundledRecipes
      .filter((item) => item && typeof item === 'object')
      .map(normalizeRecipe)
      .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));
  }

  try {
    const response = await fetch(RECIPES_JSON_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`recipes_json_${response.status}`);

    const parsed = await response.json();
    if (!Array.isArray(parsed)) throw new Error('recipes_json_invalid');

    const normalized = parsed
      .filter((item) => item && typeof item === 'object')
      .map(normalizeRecipe)
      .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));

    return normalized.length > 0 ? normalized : seed();
  } catch (error) {
    console.error('[recetas-app] load_recipes_error', error);
    return seed();
  }
}

function normalizeRecipe(item) {
  const inferredType = safeString(item.type || item.category);
  const inferredProfile = safeString(item.profile || inferProfileFromLegacy(item));
  const inferredDifficulty = safeString(item.difficulty || inferDifficultyFromLegacy(item));
  const variants = Array.isArray(item.variants) ? item.variants.map(normalizeVariant).filter(Boolean) : [];
  const images = normalizeImageList(item.images, item.image);

  return {
    id: typeof item.id === 'string' ? item.id : createId(),
    title: safeString(item.title),
    type: inferredType || 'General',
    profile: normalizeProfile(inferredProfile),
    difficulty: normalizeDifficulty(inferredDifficulty),
    prepTime: positiveNumberOrNull(item.prepTime),
    image: images[0] || '',
    images,
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
    id: typeof item.id === 'string' ? item.id : createId(),
    label: safeString(item.label) || 'Version',
    title: safeString(item.title),
    difficulty: normalizeDifficulty(item.difficulty),
    prepTime: positiveNumberOrNull(item.prepTime),
    image: images[0] || '',
    images,
    summary: safeString(item.summary),
    learns: Array.isArray(item.learns) ? item.learns.map(safeString).filter(Boolean) : [],
    ingredients: Array.isArray(item.ingredients) ? item.ingredients.map(safeString).filter(Boolean) : [],
    steps: Array.isArray(item.steps) ? item.steps.map(safeString).filter(Boolean) : [],
  };
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

    const haystack = normalizeText(
      [
        recipe.title,
        recipe.type,
        recipe.profile,
        recipe.difficulty,
        recipe.notes,
        recipe.ingredients.join(' '),
        recipe.steps.join(' '),
        recipe.variants.map((variant) => [variant.label, variant.title, variant.summary, variant.learns.join(' '), variant.ingredients.join(' '), variant.steps.join(' ')].join(' ')).join(' '),
      ].join(' ')
    );

    const matchesQuery = tokens.every((token) => haystack.includes(token));
    return matchesType && matchesDuration && matchesProfile && matchesDifficulty && matchesQuery;
  });

  return sortRecipes(filtered, state.filters.sort);
}

function renderRecipes() {
  if (!el.grid) return;

  const list = getProcessedRecipes();
  const fragment = document.createDocumentFragment();

  animateGridRefresh();
  el.grid.innerHTML = '';
  if (el.empty) el.empty.hidden = list.length > 0;

  list.forEach((recipe, index) => {
    const primaryDetail = getPrimaryDetail(recipe);
    const isProgressiveRecipe = Array.isArray(recipe.variants) && recipe.variants.length > 0;
    const node = createCardNode();
    if (!node) return;

    node.dataset.id = recipe.id;
    node.style.animationDelay = `${Math.min(index * 35, 220)}ms`;

    const thumb = node.querySelector('.thumb');
    const imageSrc = recipe.image || createPlaceholderImage(recipe.title);
    if (thumb) {
      thumb.src = imageSrc;
      thumb.alt = recipe.title;
      thumb.referrerPolicy = 'no-referrer';
      thumb.addEventListener(
        'error',
        () => {
          thumb.src = createPlaceholderImage(recipe.title);
        },
        { once: true }
      );
    }

    const title = node.querySelector('.title');
    if (title) title.textContent = recipe.title;

    const tagType = node.querySelector('.tag-type');
    setTagContent(tagType, recipe.type);

    const tagDuration = node.querySelector('.tag-duration');
    setTagContent(tagDuration, isProgressiveRecipe ? '' : formatDurationBand(primaryDetail.prepTime));

    const tagProfile = node.querySelector('.tag-profile');
    setTagContent(tagProfile, formatProfile(recipe.profile));

    const tagDifficulty = node.querySelector('.tag-difficulty');
    setTagContent(tagDifficulty, isProgressiveRecipe ? '' : formatDifficulty(primaryDetail.difficulty || recipe.difficulty));

    const desc = node.querySelector('.desc');
    if (desc) desc.textContent = buildCardDescription(recipe);

    fragment.append(node);
  });

  el.grid.append(fragment);
  updateStatus(list.length);
  renderActiveFilters();
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

function animateGridRefresh() {
  if (!el.grid) return;
  el.grid.classList.remove('grid-refresh');
  el.grid.offsetHeight;
  el.grid.classList.add('grid-refresh');
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

function openDetail(recipeId) {
  if (!el.detailTitle || !el.detailBody) return;

  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) return;

  el.detailTitle.textContent = recipe.title;
  renderRecipeDetail(recipe, 0, 0);

  showDialog(el.detailDialog);
}

function renderRecipeDetail(recipe, variantIndex, imageIndex = 0) {
  if (!el.detailBody) return;

  const variants = Array.isArray(recipe.variants) ? recipe.variants : [];
  const selectedVariant = variants[variantIndex] || null;
  const detail = selectedVariant || getPrimaryDetail(recipe);
  const imageList = getDetailImages(recipe, selectedVariant);
  const selectedImage = imageList[imageIndex] || imageList[0] || createPlaceholderImage(recipe.title);
  const ingredients = getDetailIngredients(recipe, selectedVariant).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const steps = getDetailSteps(recipe, selectedVariant).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const learns = selectedVariant?.learns?.length
    ? `
      <section class="detail-section">
        <h3>Que se aprende</h3>
        <ul class="list detail-list">${selectedVariant.learns.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </section>
    `
    : '';
  const variantSelector =
    variants.length > 0
      ? `
        <section class="variant-switcher" aria-label="Versiones de la receta">
          ${variants
            .map(
              (variant, index) => `
                <button
                  type="button"
                  class="btn ${index === variantIndex ? 'btn-primary' : 'btn-soft'} variant-btn"
                  data-variant-index="${index}"
                >
                  ${escapeHtml(variant.label)}
                </button>
              `
            )
            .join('')}
        </section>
      `
      : '';
  const gallery =
    imageList.length > 1
      ? `
        <div class="detail-gallery" aria-label="Galeria de imagenes">
          ${imageList
            .map(
              (image, index) => `
                <button
                  type="button"
                  class="detail-thumb-btn ${index === imageIndex ? 'is-active' : ''}"
                  data-image-index="${index}"
                  aria-label="Ver imagen ${index + 1}"
                >
                  <img src="${escapeAttribute(image)}" alt="${escapeAttribute(`${recipe.title} ${index + 1}`)}" class="detail-thumb-img" />
                </button>
              `
            )
            .join('')}
        </div>
      `
      : '';

  el.detailBody.innerHTML = `
    <section class="detail-hero">
      <div class="detail-media${recipe.id === 'pizza-casera-fermentacion-lenta' ? ' detail-media-pizza' : ''}">
        <img src="${escapeAttribute(selectedImage)}" alt="${escapeAttribute(
          recipe.title
        )}" class="detail-img" />
      </div>
      ${gallery}
      <div class="detail-meta">
        <span class="detail-pill">${escapeHtml(recipe.type)}</span>
        <span class="detail-pill">${escapeHtml(formatDurationBand(detail.prepTime))}</span>
        <span class="detail-pill">${escapeHtml(formatProfile(recipe.profile))}</span>
        <span class="detail-pill">${escapeHtml(formatDifficulty(detail.difficulty || recipe.difficulty))}</span>
      </div>
    </section>

    ${variantSelector}

    <section class="detail-section">
      <h3>${escapeHtml(selectedVariant?.title || 'Descripcion')}</h3>
      <p class="detail-text">${escapeHtml(selectedVariant?.summary || recipe.notes || 'Sin descripcion adicional.')}</p>
    </section>

    ${learns}

    <section class="detail-section">
      <h3>Ingredientes</h3>
      <ul class="list detail-list">${ingredients}</ul>
    </section>

    <section class="detail-section">
      <h3>Pasos</h3>
      <ol class="list detail-list">${steps}</ol>
    </section>
  `;

  const detailImg = el.detailBody.querySelector('.detail-img');
  if (detailImg) {
    detailImg.referrerPolicy = 'no-referrer';
    detailImg.addEventListener(
      'error',
      () => {
        detailImg.src = createPlaceholderImage(recipe.title);
      },
      { once: true }
    );
  }

  el.detailBody.querySelectorAll('[data-variant-index]').forEach((button) => {
    button.addEventListener('click', () => {
      renderRecipeDetail(recipe, Number(button.dataset.variantIndex || 0), 0);
    });
  });

  el.detailBody.querySelectorAll('[data-image-index]').forEach((button) => {
    button.addEventListener('click', () => {
      renderRecipeDetail(recipe, variantIndex, Number(button.dataset.imageIndex || 0));
    });
  });
}

function closeDetail() {
  closeDialog(el.detailDialog);
}

function onGridClick(event) {
  const button = event.target.closest('button');
  const card = event.target.closest('.card');
  if (!button || !card) return;

  const recipeId = card.dataset.id;
  if (!recipeId) return;

  if (button.classList.contains('btn-view')) {
    openDetail(recipeId);
  }
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

function getDetailIngredients(recipe, variant) {
  return variant?.ingredients?.length ? variant.ingredients : recipe.ingredients;
}

function getDetailSteps(recipe, variant) {
  return variant?.steps?.length ? variant.steps : recipe.steps;
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
  if (normalized === 'media') return 'Tecnica';
  if (normalized === 'alta') return 'Experta';
  return 'Tecnica';
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

function formatDurationBand(prepTime) {
  if (!Number.isFinite(prepTime) || prepTime <= 0) return 'Sin definir';
  if (prepTime <= 30) return 'Rapida';
  if (prepTime <= 60) return 'Media';
  return 'Lenta';
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

function escapeAttribute(text) {
  return String(text).replace(/"/g, '&quot;');
}

function createPlaceholderImage(title) {
  const initials = safeString(title).slice(0, 2).toUpperCase() || 'RC';
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='#f5dfbd'/>
          <stop offset='100%' stop-color='#e6bd86'/>
        </linearGradient>
      </defs>
      <rect width='100%' height='100%' fill='url(#g)' />
      <text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' fill='#7f4528' font-family='Space Grotesk, sans-serif' font-size='88' font-weight='700'>${escapeHtml(
        initials
      )}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
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

function showDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
    clearDialogFocus();
    return;
  }
  dialog.setAttribute('open', 'open');
  clearDialogFocus();
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) {
    dialog.close();
    return;
  }
  dialog.removeAttribute('open');
}

function clearDialogFocus() {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') {
      active.blur();
    }
  });
}

function createCardNode() {
  if (el.cardTpl?.content?.firstElementChild) {
    return el.cardTpl.content.firstElementChild.cloneNode(true);
  }

  const wrapper = document.createElement('article');
  wrapper.className = 'card reveal-up';
  wrapper.innerHTML = `
    <div class="thumb-wrap"><img class="thumb" alt="Imagen de receta" loading="lazy" decoding="async" /></div>
    <div class="card-body">
      <h3 class="title"></h3>
      <div class="card-tags">
        <span class="tag card-tag tag-type"></span>
        <span class="tag card-tag tag-duration"></span>
        <span class="tag card-tag tag-profile"></span>
        <span class="tag card-tag tag-difficulty"></span>
      </div>
      <p class="desc"></p>
    </div>
    <footer class="card-actions">
      <button type="button" class="btn btn-soft btn-view">Ver</button>
    </footer>
  `;

  return wrapper;
}

function seed() {
  return [
    {
      id: 'seed-banana-thermomix',
      title: 'Bizcocho de platano perfecto (Thermomix)',
      type: 'Bizcocho',
      profile: 'dulce',
      difficulty: 'media',
      prepTime: 50,
      image: 'assets/images/recipes/bizcocho-platanothermomix.jpg',
      ingredients: [
        '3 platanos maduros',
        '2 huevos',
        '120 g azucar',
        '55 g mantequilla',
        '25 g aceite suave (girasol u oliva suave)',
        '200 g harina de reposteria',
        '1 sobre levadura quimica (15-16 g)',
        '50 ml leche',
        '1 pizca de sal',
        '1 cucharadita de vainilla (opcional)',
        'Opcional: 70-80 g pepitas de chocolate o 40 g nueces',
      ],
      steps: [
        'Precalienta horno a 180C, calor arriba y abajo.',
        'Coloca la rejilla en el nivel 2 si tu horno tiene 5 niveles, contando desde abajo. Para otros hornos, toma como referencia una posicion media-baja; en uno de 3 niveles, empieza por el 2. Ajusta segun el comportamiento de tu horno y la altura del molde.',
        'Tritura 3 platanos: 5 seg / vel 5.',
        'Anade huevos, azucar, mantequilla y aceite: 20 seg / vel 4.',
        'Si mantequilla dura: 20 seg / 50C / vel 2 antes.',
        'Anade harina, levadura, sal, leche y vainilla: 15 seg / vel 4.',
        'Opcional chocolate o nueces: 5 seg / giro inverso / vel 3.',
        'Vierte en molde plum cake engrasado o con papel de horno.',
        'Hornea a 180C durante 35-45 min (puede llegar a 50 min).',
        'Observa como se dora para ajustar la altura en las siguientes hornadas: si se tuesta demasiado por arriba, prueba un nivel mas bajo; si se tuesta demasiado la base, prueba uno mas alto. La coccion del interior depende tambien del tiempo, no solo de la altura.',
        'Si la superficie ya esta dorada pero el interior sigue crudo, cubre el molde holgadamente con papel de aluminio y continua horneando, comprobando el centro con un palillo. El aluminio protege la parte superior mientras el interior termina de hacerse. Evita abrir el horno durante la primera parte de la coccion y no dejes que el aluminio toque las resistencias.',
        'Punto correcto: palillo con migas humedas, sin masa liquida.',
        'Deja 10-15 min en molde, desmolda y enfria 20-30 min antes de cortar.',
        'Conservacion: envolver en film y guardar a temperatura ambiente (2-3 dias).',
      ],
      notes: 'Bizcocho jugoso y aromatico para aprovechar platanos maduros.',
      variants: [],
      updatedAt: '2026-04-07T00:00:00.000Z',
    },
    {
      id: 'seed-apple-thermomix',
      title: 'Bizcocho de manzana (Thermomix)',
      type: 'Bizcocho',
      profile: 'dulce',
      difficulty: 'media',
      prepTime: 55,
      image: 'assets/images/recipes/bizcocho-manzana.jpg',
      ingredients: [
        '3 huevos',
        '150 g azucar',
        '100 g mantequilla (o 70 g mantequilla + 30 g aceite)',
        '120 g leche',
        '200 g harina',
        '1 sobre levadura (16 g)',
        '1 pizca de sal',
        '1 cucharadita de vainilla',
        '1 cucharadita de canela',
        '2 manzanas en daditos (peladas)',
      ],
      steps: [
        'Huevos + azucar: 3 min / 37C / vel 4.',
        'Anade mantequilla: 30 seg / vel 4.',
        'Anade leche + vainilla: 10 seg / vel 4.',
        'Anade harina + levadura + sal + canela: 10 seg / vel 4 (solo mezclar).',
        'Anade manzana en daditos fuera de Thermomix y mezcla con espatula.',
        'Pasa a molde engrasado (no llenar mas de 2/3).',
        'Hornea a 180C durante 45-50 min (vigilar desde min 40).',
        'Palillo limpio: listo. Si sale humedo, hornear 5-10 min mas.',
        'Enfriar 10-15 min en molde y despues desmoldar.',
      ],
      notes:
        'Trucos clave: no sobrebatir la harina, manzana en dados pequenos, 2 manzanas para jugosidad y canela + vainilla para sabor.',
      variants: [],
      updatedAt: '2026-04-07T00:00:00.000Z',
    },
    {
      id: 'seed-focaccia-progresion',
      title: 'Focaccia artesanal',
      type: 'Pan',
      profile: 'salado',
      difficulty: 'baja',
      prepTime: 300,
      image: 'assets/images/recipes/focaccia-artesanal.jpg',
      ingredients: [],
      steps: [],
      notes: 'Una sola receta con progresion por niveles para aprender pliegues, fermentacion y estructura de la masa.',
      variants: [
        {
          id: 'focaccia-nivel-1',
          label: 'Nivel 1',
          title: 'Focaccia clasica',
          difficulty: 'baja',
          prepTime: 300,
          summary:
            'La receta ideal para empezar en panaderia artesanal. Trabajaras una masa hidratada con pliegues y tendras una focaccia esponjosa por dentro y crujiente por fuera en el mismo dia.',
          learns: ['Masa hidratada', 'Pliegues basicos', 'Focaccia lista en el dia'],
          ingredients: [
            '500 g harina de fuerza (W250-W300)',
            '365 g agua templada',
            '5,5 g levadura seca de panaderia',
            '10 g sal',
            '20 g aceite de oliva virgen extra',
            'Para la bandeja: 3-4 cucharadas de aceite de oliva virgen extra',
            'Toppings: sal gruesa o en escamas, romero, el topping que tu quieras (por ejemplo tomates cherry) y un chorrito de aceite',
          ],
          steps: [
            'Mezcla harina y levadura. Anade agua, sal y aceite hasta que no quede harina seca. No amases: la masa debe quedar pegajosa.',
            'Deja reposar 15 minutos.',
            'Haz una vuelta de pliegues desde los cuatro lados.',
            'Reposa 20 minutos.',
            'Repite una segunda ronda de pliegues.',
            'Reposa otros 20 minutos.',
            'Haz la tercera y ultima ronda de pliegues.',
            'Fermenta tapada hasta que aumente claramente de volumen: 1 h 30 min en verano o unas 2 h en invierno.',
            'Aceita generosamente la bandeja, pasa la masa con cuidado y estirala suave. Si se encoge, espera 10 minutos.',
            'Deja una segunda fermentacion de 30 minutos.',
            'Anade aceite por encima, marca los hoyuelos con los dedos y reparte sal, romero y cherry si quieres.',
            'Hornea a 220C, calor arriba y abajo, durante 20-25 minutos.',
          ],
        },
        {
          id: 'focaccia-nivel-2',
          label: 'Nivel 2',
          title: 'Focaccia de fermentacion lenta',
          difficulty: 'media',
          prepTime: 1440,
          summary:
            'La evolucion natural de la focaccia clasica. La fermentacion en frio desarrolla mas sabor, una miga mas ligera y una textura todavia mas aireada.',
          learns: ['Fermentacion en frio', 'Mas sabor', 'Mejor estructura de masa'],
          ingredients: [
            '500 g harina de fuerza (W300)',
            '365 g agua templada',
            '5,5 g levadura seca',
            '10 g sal',
            '20 g aceite de oliva',
            'Para la bandeja: 3-4 cucharadas de aceite',
            'Toppings: sal gruesa, romero, el topping que tu quieras (por ejemplo tomates cherry o cebolla caramelizada) y aceite de oliva',
          ],
          steps: [
            'Mezcla la masa igual que en el nivel 1 y deja reposar 15 minutos.',
            'Haz el primer pliegue y reposa 20 minutos.',
            'Haz el segundo pliegue y reposa 20 minutos.',
            'Haz el tercer pliegue y deja 30-40 minutos a temperatura ambiente.',
            'Guarda la masa tapada en la nevera durante unas 20 horas.',
            'Saca la masa y atemperala 45-60 minutos.',
            'Aceita bien la bandeja, pasa la masa y estirala con suavidad.',
            'Deja una segunda fermentacion de 30 minutos.',
            'Anade aceite, haz los hoyuelos y reparte sal, romero, cherry y cebolla caramelizada si te apetece.',
            'Hornea a 220C, calor arriba y abajo, durante 20-25 minutos.',
          ],
        },
      ],
      updatedAt: '2026-07-24T00:00:00.000Z',
    },
    {
      "id": "pan-masa-madre-cocotte",
      "title": "Pan de masa madre - Receta base",
      "type": "Pan",
      "profile": "salado",
      "difficulty": "alta",
      "prepTime": 1080,
      "image": "assets/images/recipes/pan-masa-madre.jpg",
      "ingredients": [
        "Para 1 hogaza: 500 g de harina total (trigo blanco de fuerza e integral, en la proporcion elegida)",
        "350 g de agua: 330 g para la autolisis y 20 g reservados para la sal",
        "100 g de masa madre activa al 100 % de hidratacion",
        "10 g de sal",
        "Harina de arroz para el banneton y, opcionalmente, para espolvorear antes de hornear",
        "Mezcla blanca: 500 g de harina blanca; 90/10: 450 g blanca + 50 g integral; 80/20: 400 g blanca + 100 g integral; 70/30: 350 g blanca + 150 g integral; 50/50: 250 g blanca + 250 g integral",
        "Para la parte blanca, utiliza harina de fuerza o panificable, aproximadamente 12-14 g de proteina por 100 g. Las proporciones anteriores se refieren a los 500 g de harina anadida; la harina del cultivo tambien influye en la mezcla final."
      ],
      "steps": [
        "Activar la masa madre: alimentala y espera a que este cerca de su pico, con aumento claro de volumen, abundantes burbujas, textura aireada, superficie ligeramente abombada y aroma agradable, fermentado y algo acido. Utiliza 100 g. No es necesaria la prueba de flotacion.",
        "Autolisis (30-45 min): mezcla los 500 g de harinas elegidas con 330 g de agua hasta que no quede harina seca. Reserva los otros 20 g. No hace falta amasar; tapa y deja reposar para que se hidrate y empiece a desarrollar gluten.",
        "Anadir la masa madre: incorpora los 100 g con las manos ligeramente humedas, pellizcando y plegando suavemente hasta distribuirla. Reposa 15 minutos. La fermentacion en bloque empieza a contar desde esta incorporacion.",
        "Anadir la sal: disuelve 10 g de sal en los 20 g de agua reservada e incorpora con pellizcos y pliegues. Si parece perder estructura, continua suavemente hasta absorber el agua. Reposa 20-30 minutos.",
        "Pliegues: haz 4 tandas separadas unos 30 minutos. En cada una, humedece la mano, estira suavemente un lateral y doblalo al centro; gira el recipiente 90 grados y repite hasta completar los cuatro lados. La masa debe ganar elasticidad y resistencia. Tras la cuarta tanda, deja de manipularla.",
        "Fermentacion en bloque: deja tapada a temperatura ambiente hasta un aumento aproximado del 40-50 %, con burbujas, superficie algo abombada, aspecto aireado y ligero temblor al mover el recipiente. A 25-26 C, unas 4-5 horas desde que anadiste la masa madre son orientativas. La temperatura, harina y actividad del cultivo cambian los tiempos: manda la apariencia de la masa.",
        "Preformado: vuelca con cuidado sobre una encimera limpia, lleva los extremos al centro y gira para dejar la costura abajo. Arrastra suavemente hacia ti, girando entre movimientos, hasta formar una bola lisa y tensa. Conserva el gas y para cuando mantenga razonablemente la forma.",
        "Reposo: deja la masa 20 minutos sobre la encimera. Es normal que se relaje y ensanche ligeramente.",
        "Formado final: dale la vuelta con la zona pegajosa arriba. Pliega la parte inferior, izquierda y derecha hacia el centro, y la superior hacia abajo. Enrolla con suavidad creando tension, sin expulsar el gas, y cierra la costura si hace falta.",
        "Banneton: enharinalo generosamente con harina de arroz. Coloca la hogaza con la superficie lisa abajo y la costura arriba; puedes pellizcarla para cerrarla. Cubre para evitar que la masa se reseque.",
        "Fermentacion en frio: lleva directamente a la nevera durante unas 10-16 horas; 12 horas son un buen punto de partida. Mas tiempo puede desarrollar aroma y acidez, pero una masa ya muy fermentada puede sobrefermentar: mas horas no siempre son mejores.",
        "Precalentar: deja el pan en la nevera. Introduce la cocotte con su tapa en el horno y precalienta unos 45 minutos a 250 C, calor arriba y abajo, sin ventilador.",
        "Desmoldar: saca el pan frio justo antes de hornear, coloca papel de horno sobre el banneton y vuelcalo con cuidado. Retira el banneton. Opcionalmente, espolvorea una capa muy fina de harina de arroz para crear contraste con la corteza.",
        "Corte antes de hornear: con una cuchilla inclinada unos 30-45 grados, haz un corte largo, ligeramente descentrado, de unos 2/3-3/4 del diametro y 0,8-1 cm de profundidad. Haz un movimiento rapido y decidido justo antes de meterlo al horno.",
        "Horneado tapado: introduce el pan con el papel en la cocotte caliente, tapa y hornea 20 minutos a 240 C. Manipula la cocotte con proteccion adecuada. El vapor mantiene flexible la superficie durante la expansion del pan.",
        "Horneado destapado: retira la tapa y continua a 210-220 C durante unos 15-25 minutos, hasta una corteza de color marron intenso y uniforme. Vigila el dorado y ajusta temperatura y tiempo a tu horno.",
        "Enfriado: saca inmediatamente la hogaza de la cocotte y dejala sobre una rejilla, sin cortar, al menos 1 h 30 min; idealmente unas 2 horas. La miga termina de estabilizarse durante el enfriado."
      ],
      "notes": "Hogaza en cocotte adaptable a distintas mezclas de trigo blanco e integral. Mas integral aporta sabor a cereal y fibra, suele cerrar algo la miga y puede pedir mas agua. Grandes cantidades de centeno, espelta u otros cereales requieren adaptar la receta. Los 350 g de agua son un punto de partida: sumando los 50 g de agua y 50 g de harina del cultivo, hay 400 g de agua y 550 g de harina, aproximadamente un 73 % de hidratacion real. Con experiencia puedes probar 365 g de agua anadida (75,5 % real), segun lo que admita la harina. Fermenta hasta que la masa este preparada, no solo durante un numero fijo de horas.",
      "variants": [],
      "updatedAt": "2026-09-14T00:00:00.000Z"
    },
    {
      id: 'masa-madre-integral-trigo',
      title: 'Masa madre integral de trigo',
      type: 'Masa madre',
      profile: 'salado',
      difficulty: 'media',
      prepTime: 10080,
      image: 'assets/images/recipes/masa-madre-integral.jpg',
      images: ['assets/images/recipes/masa-madre-integral.jpg'],
      ingredients: [
        'Para empezar: 30 g de harina integral de trigo',
        'Para empezar: 30 g de agua a temperatura ambiente',
        'Para los refrescos: harina integral de trigo',
        'Para los refrescos: agua a temperatura ambiente',
        'Tambien necesitaras un bote de cristal, una bascula y una goma elastica o rotulador para marcar el nivel',
      ],
      steps: [
        'Dia 1: mezcla 30 g de harina integral de trigo con 30 g de agua hasta obtener una pasta espesa y homogenea. Marca el nivel y deja el bote unas 24 horas a temperatura ambiente.',
        'Dia 2: conserva 30 g de la mezcla anterior, desecha el resto y anade 30 g de agua y 30 g de harina integral. Mezcla y vuelve a marcar el nivel.',
        'Durante los dias siguientes repite aproximadamente cada 24 horas: conserva 30 g, anade 30 g de agua, mezcla, anade 30 g de harina integral y vuelve a mezclar bien.',
        'No te asustes si durante los primeros dias hay olores fuertes, poca actividad o algo de liquido. Lo importante es que con el tiempo evolucione hacia un aroma acido y fermentado agradable.',
        'Si aparece moho o manchas rosas, naranjas o de colores anormales, desecha la masa madre y empieza de nuevo.',
        'Considera que esta lista cuando, despues de alimentarla, duplica o triplica de forma consistente, tiene muchas burbujas y un aroma agradable durante varios refrescos seguidos.',
        'El pico de actividad llega despues del refresco, cuando crece al maximo antes de empezar a bajar. Ese es el mejor momento para usarla en pan.',
        'Una vez madura, puedes ajustar la velocidad con proporciones como 1:1:1, 1:2:2 o 1:3:3 segun tu horario.',
        'Para guardarla en nevera, refrescala por ejemplo con 20 g de masa madre, 40 g de agua y 40 g de harina integral, deja que arranque un poco y refrigerala.',
        'Para reactivarla despues de la nevera, saca una pequena cantidad, refrescala, espera de nuevo al pico y ya podras usarla en tus masas.',
      ],
      notes:
        'Base sencilla para crear tu masa madre integral desde cero y mantenerla viva durante anos. Incluye refrescos, senales de madurez, uso en recetas y conservacion en nevera.',
      updatedAt: '2026-08-15T00:00:00.000Z',
    },
    {
      "id": "pizza-casera-fermentacion-lenta",
      "title": "Pizza casera de fermentacion lenta",
      "type": "Pizza",
      "profile": "salado",
      "difficulty": "media",
      "prepTime": 2160,
      "image": "assets/images/recipes/pizza-casera.jpg",
      "ingredients": [
        "Masa recomendada: 500 g de harina apta para fermentaciones largas",
        "350 g de agua (70 % de hidratacion; reserva 20 g para la sal)",
        "10 g de sal (2 %)",
        "15 g de aceite de oliva virgen extra (3 %), mas un poco para el recipiente y la bandeja",
        "Levadura seca de panaderia: cantidad segun el tiempo de fermentacion (ver indicaciones mas abajo)",
        "Salsa para una bandeja grande: 180-220 g de tomate triturado, unos 3 g de sal y 5-10 g de AOVE",
        "Mozzarella bien escurrida, cantidad al gusto",
        "Opcional: Parmigiano Reggiano y albahaca fresca",
        "Toppings al gusto: pepperoni, salami, prosciutto, jamon, champinones, cebolla, pimientos, aceitunas u otros quesos"
      ],
      "steps": [
        "Elige la formula: como punto de partida, usa 70 % de hidratacion y 24-36 horas de fermentacion con 1-1,5 g de levadura seca por 500 g de harina. Son valores orientativos que puedes adaptar; observa siempre la actividad de la masa.",
        "Hidratacion para 500 g de harina: 60 % = 300 g de agua (masa firme); 65 % = 325 g (manejable); 70 % = 350 g (aireada y equilibrada); 75 % = 375 g (mas pegajosa); 80 % = 400 g (requiere harina adecuada y mas tecnica). Para bandeja, empieza entre 65 y 75 %. Mas agua no significa automaticamente mejor pizza.",
        "Levadura seca orientativa por 500 g de harina: 3-5 h, 5-7 g; 6-8 h, 3-4 g; 8-12 h, 2-3 g; 18-24 h, 1,5-2 g; 24-36 h, 1-1,5 g; 36-48 h, 0,5-1 g; 48-72 h, 0,3-0,7 g. Las fermentaciones cortas son principalmente a temperatura ambiente; desde 18 h, principalmente en nevera. Ajusta segun temperatura, harina y actividad de la levadura.",
        "Reserva 20 g del agua. Mezcla el resto con la levadura e incorpora la harina poco a poco hasta hidratarla por completo. Tapa y deja reposar unos 20 minutos.",
        "Disuelve la sal en el agua reservada e incorporala poco a poco. Anade el AOVE y trabaja suavemente hasta integrarlo. Reposa otros 15-20 minutos. Al 70 % o mas puede estar muy pegajosa al principio: no anadas harina solo porque se pegue.",
        "Con las manos ligeramente humedas, estira un lateral y doblalo hacia el centro. Repite desde los distintos lados. Haz unas 3 rondas de pliegues, con 15 minutos de descanso entre rondas, hasta que gane estructura y elasticidad.",
        "Para la fermentacion larga, pasa la masa a un recipiente ligeramente aceitado, cierralo bien y guardalo en la nevera. El dia de hornear, sacala unas 2-4 horas antes. No es obligatorio que duplique dentro de la nevera: busca burbujas, expansion y una masa activa, aireada y relajada. Los tiempos totales son aproximados e incluyen los reposos fuera del frio.",
        "Si eliges una fermentacion corta con mas levadura, deja la masa principalmente a temperatura ambiente hasta que este claramente activa y aireada. Una cocina caliente acelera mucho el proceso: manda la masa, no solo el reloj.",
        "Mezcla el tomate triturado con la sal y el aceite de la salsa. No hace falta cocinarla previamente.",
        "Si usas mozzarella fresca, cortala y dejala escurrir. Puedes secarla con papel absorbente y conservarla en nevera hasta usarla para reducir el exceso de agua.",
        "Unta la bandeja con una pelicula fina y uniforme de AOVE. Vuelca la masa con cuidado y extiendela del centro a los extremos con las manos ligeramente aceitadas. Evita el rodillo y no aplastes el gas.",
        "Si la masa se encoge, dejala descansar 15-20 minutos antes de seguir extendiendo. Una vez extendida, reposa unos 30-60 minutos: debe quedar relajada, ligeramente hinchada y con algunas burbujas.",
        "Precalienta el horno unos 30-40 minutos a su temperatura maxima. Referencia: 280 C, calor arriba y abajo, sin ventilador. Los tiempos siguientes son para 280 C; a 250 C necesitara algo mas. Usa una bandeja apta para la temperatura elegida.",
        "Extiende una capa fina de tomate dejando 1-1,5 cm de borde. Puedes anadir un poco de Parmigiano Reggiano. Reserva la mozzarella y los toppings para la segunda fase y evita sobrecargar la pizza con ingredientes humedos.",
        "Primer horneado: coloca la bandeja en una posicion baja, aproximadamente el segundo nivel contando desde abajo. A 280 C, hornea unos 8-10 minutos. Busca bordes crecidos que empiecen a dorarse, masa con estructura, tomate menos acuoso y una base que empiece a tostarse.",
        "Saca la pizza y anade la mozzarella escurrida y los toppings elegidos. Puedes dividir la bandeja en varios sabores: margherita, pepperoni o cuatro quesos. Reserva el prosciutto y la albahaca para despues del horno. Los ingredientes que necesiten mas coccion deben prepararse antes.",
        "Segundo horneado: devuelve la bandeja a una posicion central durante unos 3-5 minutos a 280 C. La mozzarella debe estar fundida y ligeramente burbujeante, los toppings cocinados y los bordes bien dorados. Puede salir algo de agua del queso o grasa del pepperoni.",
        "Si la superficie necesita mas dorado, termina brevemente en una posicion mas alta vigilando constantemente. Ajusta los tiempos segun tu horno y el grosor de la masa.",
        "Fuera del horno, termina al gusto con un hilo de AOVE, Parmigiano Reggiano, albahaca o prosciutto. Deja reposar unos 5 minutos antes de cortar.",
        "Para adaptar cantidades, toma la harina como 100 %: agua 70 %, sal 2 % y AOVE 3 %. Con 750 g de harina: 525 g de agua, 15 g de sal y 22,5 g de AOVE. Escala tambien la levadura de la referencia para 500 g multiplicandola por 1,5 y ajusta al tiempo y la temperatura elegidos."
      ],
      "notes": "Pizza en bandeja de base ligeramente crujiente e interior tierno, elastico y aireado. Formula recomendada: 70 % de hidratacion y unas 24-36 horas, principalmente en frio. Incluye alternativas de hidratacion, levadura y fermentacion para adaptarla a tu horario.",
      "variants": [],
      "updatedAt": "2026-09-14T00:00:00.000Z"
    },
    {
      "id": "pasta-fresca-al-huevo",
      "title": "Pasta fresca al huevo",
      "type": "Pasta",
      "profile": "salado",
      "difficulty": "media",
      "prepTime": 90,
      "image": "assets/images/recipes/pasta-fresca.jpg",
      "ingredients": [
        "Por persona: 100 g de harina de trigo y aproximadamente 55-60 g de huevo sin cascara (como referencia sencilla, 1 huevo)",
        "Para 2 personas: 200 g de harina y unos 110-120 g de huevo sin cascara (aproximadamente 2 huevos)",
        "Para 4 personas: 400 g de harina y unos 220-240 g de huevo sin cascara (aproximadamente 4 huevos)",
        "Preferiblemente harina italiana tipo 00 para pasta fresca; tambien puedes utilizar harina comun de trigo",
        "Un poco de harina extra para la mesa y para separar las hebras",
        "Agua y sal para la coccion"
      ],
      "steps": [
        "Medir: toma como referencia 100 g de harina por persona y 55-60 g de huevo sin cascara. Un huevo por cada 100 g es una regla facil de recordar, pero pesarlo permite ajustar mejor. La absorcion de la harina y el tamano de los huevos varian.",
        "Mezclar: forma un volcan con la harina sobre la mesa y pon los huevos en el centro. Batelos con un tenedor e incorpora poco a poco la harina de las paredes. Tambien puedes empezar en un bol y pasar la masa a la encimera cuando se una.",
        "Amasar: trabaja unos 8-10 minutos. Al principio puede estar seca y rugosa; amasa varios minutos antes de corregirla. Busca una masa firme, lisa, elastica, apenas pegajosa y que recupere parcialmente la forma al presionarla. No debe quedar tan blanda como una masa de pan o pizza.",
        "Ajustar la textura: si esta un poco seca, humedece ligeramente los dedos y sigue amasando. Si esta bastante seca, puedes incorporar una yema; si no consigue unirse, anade huevo batido poco a poco, sin echar necesariamente un huevo entero. Si esta pegajosa, incorpora pequenas cantidades de harina. Haz correcciones graduales para no pasarte.",
        "Reposar: forma una bola, envuelvela bien en film y deja 30-60 minutos a temperatura ambiente; 45 minutos son una buena referencia. La harina termina de hidratarse y el gluten se relaja.",
        "Dividir: separa la masa en 3-4 porciones. Manten siempre tapadas las que no estes utilizando, porque se secan rapidamente al aire.",
        "Con maquina: aplana una porcion y pasala por la posicion mas gruesa. Dobla en tres y repite 3-5 veces hasta obtener una lamina lisa. Reduce el grosor progresivamente, de grueso a medio y fino, sin saltar muchas posiciones. Como orientacion para una Marcato Atlas 150: 4 para una pasta mas gruesa, 5 para muchas pastas largas y 6 para pasta fina; ajusta al formato y a tu maquina.",
        "Con rodillo: enharina muy ligeramente la mesa. Estira una porcion desde el centro hacia fuera, girandola regularmente, hasta obtener una lamina fina y uniforme. Manten tapado el resto de la masa.",
        "Cortar: usa el accesorio de la maquina o corta a mano. Para tagliatelle o fettuccine, enharina ligeramente la lamina, enrollala sin apretar, corta tiras con un cuchillo y desenrollalas enseguida. Separa bien las hebras y espolvorea un poco de harina si se pegan. Para spaghetti redondos hace falta normalmente un cortador especifico; con cuchillo obtendras pasta plana. Tambien puedes preparar laminas de lasana o utilizarla para ravioli.",
        "Cocer: utiliza abundante agua hirviendo con sal. Como referencia para pasta larga fresca, calcula aproximadamente 1,5-3 minutos, segun el grosor, y prueba el punto. Otros formatos, especialmente los rellenos, pueden necesitar tiempos distintos.",
        "Terminar con salsa: si vas a cocinarla otros 30-60 segundos en la salsa, sacala del agua un poco antes. Reserva algo del agua de coccion para ayudar a ligar la salsa.",
        "Preparar para congelar: separa las hebras y forma nidos sueltos, sin compactarlos. Deja 10-15 minutos al aire para secar ligeramente la superficie y colocalos separados sobre una bandeja con papel de horno.",
        "Congelar: lleva la bandeja al congelador unas 2 horas, o hasta que los nidos esten completamente duros. Despues pasalos a bolsas de congelacion o recipientes hermeticos. Congelarlos separados evita que formen un bloque.",
        "Cocinar congelada: no descongeles. Pasa los nidos directamente al agua hirviendo con sal y mueve suavemente durante los primeros segundos para separar las hebras. Comprueba la coccion probando la pasta."
      ],
      "notes": "Pasta fresca italiana para estirar con maquina o rodillo: tagliatelle, fettuccine, lasana, ravioli y otros formatos. Referencia por persona: 100 g de harina y unos 55-60 g de huevo sin cascara. Las proporciones son orientativas; la textura final manda. El tiempo indicado es aproximado e incluye el reposo, pero no la congelacion opcional.",
      "variants": [],
      "updatedAt": "2026-09-14T00:00:00.000Z"
    },
    {
      "id": "carbonara-romana",
      "title": "Carbonara romana",
      "type": "Pasta",
      "profile": "salado",
      "difficulty": "media",
      "prepTime": 30,
      "image": "assets/images/recipes/carbonara-romana.jpg",
      "ingredients": [
        "Para 2 personas: 200 g de pasta (por ejemplo, spaghetti secos)",
        "100-120 g de guanciale",
        "4 yemas de huevo",
        "80 g de Pecorino Romano, rallado muy fino, mas un poco para terminar",
        "Pimienta negra recien molida",
        "Sal para el agua de coccion, en cantidad moderada",
        "Agua de coccion de la pasta: reserva unos 250 ml y utiliza solo la necesaria",
        "Proporcion por persona: 100 g de pasta, 50-60 g de guanciale, 2 yemas y 40 g de Pecorino Romano"
      ],
      "steps": [
        "Elegir la pasta: utiliza spaghetti secos, rigatoni, mezze maniche o tonnarelli. La pasta seca funciona muy bien; no necesitas preparar pasta fresca para esta receta.",
        "Preparar el guanciale: cortalo en tiras o dados de 0,5-1 cm y ponlo en una sarten fria, sin aceite. Calienta a fuego medio-bajo hasta que libere grasa y quede dorado, ligeramente crujiente por fuera y jugoso por dentro. Retira los trozos y conserva la grasa.",
        "Preparar la crema: mezcla energicamente las 4 yemas con los 80 g de Pecorino rallado muy fino y pimienta negra al gusto. Es normal que quede una pasta amarilla y espesa. Incorpora poco a poco 1-2 cucharadas de la grasa del guanciale, templada, sin que este muy caliente. Reserva el agua para ajustar despues.",
        "Cocer la pasta: lleva agua a ebullicion y sala moderadamente, porque el guanciale y el queso ya aportan sal. Anade los spaghetti y deja que se ablanden para introducirlos suavemente, sin romperlos. Remueve y cuece aproximadamente 1 minuto menos de lo indicado por el fabricante, buscando un punto al dente.",
        "Reservar el agua: antes de sacar la pasta, guarda unos 250 ml del agua de coccion. No se utiliza toda necesariamente; sirve para ajustar la salsa poco a poco.",
        "Mezclar con el guanciale: devuelve buena parte de los trozos a la sarten con su grasa y guarda algunos para servir. Pasa la pasta casi cocida a la sarten, anade 1-2 cucharadas del agua reservada y mezcla durante 30-60 segundos.",
        "Retirar del fuego: aparta completamente la sarten. Si esta extremadamente caliente, espera unos segundos. Pasa la pasta caliente y el guanciale al bol de yemas, queso y pimienta, y mezcla inmediatamente con energia. Controla el calor para evitar que las yemas cuajen en grumos.",
        "Ajustar la salsa: anade 1 cucharada de agua de coccion, mezcla y comprueba. Repite solo si hace falta. Busca una salsa brillante, espesa pero cremosa, que se adhiera a la pasta sin formar un charco. El agua no tiene una cantidad fija.",
        "Servir inmediatamente: reparte la pasta y termina con los trozos crujientes reservados, un poco de Pecorino recien rallado y pimienta negra.",
        "Pasta fresca opcional: por persona, mezcla unos 100 g de harina con 1 huevo, amasa unos 10 minutos y deja reposar envuelta 30 minutos. Estira con rodillo o maquina y corta. Como referencia, cuece 2-4 minutos segun grosor, comprobando el punto. Este trabajo adicional no esta incluido en los 30 minutos de la receta.",
        "Sustituciones: si no tienes guanciale, puedes utilizar panceta; el bacon aporta un sabor ahumado diferente. El Pecorino puede sustituirse por Parmigiano Reggiano o una mezcla a partes iguales de ambos. Ajusta la sal segun el queso elegido."
      ],
      "notes": "Carbonara al estilo romano con guanciale, Pecorino, pimienta y 2 yemas por persona para una salsa intensa y cremosa. La emulsion se forma con las yemas, el queso, la grasa del guanciale y agua de coccion anadida poco a poco. No necesita nata, leche, mantequilla, aceite, ajo ni cebolla.",
      "variants": [],
      "updatedAt": "2026-09-14T00:00:00.000Z"
    },
  ];
}





