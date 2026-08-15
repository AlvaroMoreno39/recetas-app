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

  return {
    id: typeof item.id === 'string' ? item.id : createId(),
    title: safeString(item.title),
    type: inferredType || 'General',
    profile: normalizeProfile(inferredProfile),
    difficulty: normalizeDifficulty(inferredDifficulty),
    prepTime: positiveNumberOrNull(item.prepTime),
    image: normalizeImageUrl(item.image),
    ingredients: Array.isArray(item.ingredients) ? item.ingredients.map(safeString).filter(Boolean) : [],
    steps: Array.isArray(item.steps) ? item.steps.map(safeString).filter(Boolean) : [],
    notes: safeString(item.notes),
    variants,
    updatedAt: safeString(item.updatedAt) || new Date().toISOString(),
  };
}

function normalizeVariant(item) {
  if (!item || typeof item !== 'object') return null;

  return {
    id: typeof item.id === 'string' ? item.id : createId(),
    label: safeString(item.label) || 'Version',
    title: safeString(item.title),
    difficulty: normalizeDifficulty(item.difficulty),
    prepTime: positiveNumberOrNull(item.prepTime),
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
  renderRecipeDetail(recipe, 0);

  showDialog(el.detailDialog);
}

function renderRecipeDetail(recipe, variantIndex) {
  if (!el.detailBody) return;

  const variants = Array.isArray(recipe.variants) ? recipe.variants : [];
  const selectedVariant = variants[variantIndex] || null;
  const detail = selectedVariant || getPrimaryDetail(recipe);
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

  el.detailBody.innerHTML = `
    <section class="detail-hero">
      <img src="${escapeAttribute(recipe.image || createPlaceholderImage(recipe.title))}" alt="${escapeAttribute(
        recipe.title
      )}" class="detail-img" />
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
      renderRecipeDetail(recipe, Number(button.dataset.variantIndex || 0));
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
        'Tritura 3 platanos: 5 seg / vel 5.',
        'Anade huevos, azucar, mantequilla y aceite: 20 seg / vel 4.',
        'Si mantequilla dura: 20 seg / 50C / vel 2 antes.',
        'Anade harina, levadura, sal, leche y vainilla: 15 seg / vel 4.',
        'Opcional chocolate o nueces: 5 seg / giro inverso / vel 3.',
        'Vierte en molde plum cake engrasado o con papel de horno.',
        'Hornea a 180C durante 35-45 min (puede llegar a 50 min).',
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
      id: 'pan-masa-madre-cocotte-8020',
      title: 'Pan de masa madre en cocotte (80/20)',
      type: 'Pan',
      profile: 'salado',
      difficulty: 'alta',
      prepTime: 1080,
      image: '',
      ingredients: [
        '400 g harina blanca de fuerza',
        '100 g harina integral de trigo',
        '350 g agua total',
        '100 g masa madre activa al 100 % de hidratacion',
        '10 g sal',
      ],
      steps: [
        'Prepara la masa madre y usala cuando este activa, aireada, con burbujas y cerca de su pico.',
        'Haz una autolisis de 30-45 minutos mezclando 400 g harina blanca, 100 g harina integral y 330 g de agua. Reserva 20 g de agua.',
        'Anade 100 g de masa madre activa y mezcla pellizcando y plegando hasta repartirla bien. Deja reposar 15 minutos.',
        'Disuelve 10 g de sal en los 20 g de agua reservada. Anadelo a la masa y mezcla con suavidad hasta que se absorba. Reposa 20-30 minutos.',
        'Haz 4 tandas de pliegues, dejando unos 30 minutos entre cada una.',
        'Deja fermentar en bloque hasta que la masa aumente aproximadamente un 40-50 %, se vea hinchada, con burbujas y cierta vibracion al mover el recipiente.',
        'Vuelca la masa con cuidado, haz un preformado suave y crea tension arrastrandola sobre la mesa hasta formar una bola lisa.',
        'Deja reposar 20 minutos en la encimera.',
        'Haz el formado final plegando hacia el centro y enrollando con suavidad para mantener el gas.',
        'Pon la hogaza en un banneton bien enharinado, con la superficie lisa abajo y la costura arriba. Cubre con film.',
        'Lleva a la nevera entre 10 y 16 horas para la fermentacion en frio.',
        'Precalienta horno y cocotte a 250C, calor arriba y abajo, durante 45 minutos.',
        'Saca el pan frio de la nevera, vuelcalo sobre papel de horno y haz un greñado largo, ligeramente descentrado.',
        'Hornea 20 minutos tapado a 240C dentro de la cocotte.',
        'Destapa y termina el dorado a 210C durante 13-18 minutos, vigilando desde el minuto 13.',
        'Deja enfriar sobre rejilla al menos 1 h 30 min, idealmente 2 horas, antes de cortar.',
      ],
      notes:
        'Hogaza de masa madre en cocotte con mezcla 80/20: 80 % harina blanca de fuerza y 20 % harina integral. Da una masa bastante manejable, con buen sabor y una miga muy equilibrada.',
      variants: [],
      updatedAt: '2026-08-15T00:00:00.000Z',
    },
  ];
}





