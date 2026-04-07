const RECIPES_JSON_URL = 'assets/data/recipes.json';

const state = {
  recipes: [],
  filters: {
    query: '',
    type: 'all',
    profile: 'all',
    duration: 'all',
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

  if (el.profileFilter) {
    el.profileFilter.addEventListener('change', (event) => {
      state.filters.profile = event.target.value;
      renderRecipes();
    });
  }

  if (el.timeFilter) {
    el.timeFilter.addEventListener('change', (event) => {
      state.filters.duration = event.target.value;
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

  return {
    id: typeof item.id === 'string' ? item.id : createId(),
    title: safeString(item.title),
    type: inferredType || 'General',
    profile: normalizeProfile(inferredProfile),
    prepTime: positiveNumberOrNull(item.prepTime),
    image: normalizeImageUrl(item.image),
    ingredients: Array.isArray(item.ingredients) ? item.ingredients.map(safeString).filter(Boolean) : [],
    steps: Array.isArray(item.steps) ? item.steps.map(safeString).filter(Boolean) : [],
    notes: safeString(item.notes),
    updatedAt: safeString(item.updatedAt) || new Date().toISOString(),
  };
}

function getProcessedRecipes() {
  const tokens = normalizeText(state.filters.query).split(' ').filter(Boolean);

  const filtered = state.recipes.filter((recipe) => {
    const matchesType = state.filters.type === 'all' || recipe.type === state.filters.type;
    const matchesProfile = state.filters.profile === 'all' || recipe.profile === state.filters.profile;
    const matchesDuration = matchesDurationFilter(recipe.prepTime, state.filters.duration);

    const haystack = normalizeText(
      [recipe.title, recipe.type, recipe.profile, recipe.notes, recipe.ingredients.join(' '), recipe.steps.join(' ')].join(
        ' '
      )
    );

    const matchesQuery = tokens.every((token) => haystack.includes(token));
    return matchesType && matchesProfile && matchesDuration && matchesQuery;
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
    if (tagType) tagType.textContent = recipe.type;

    const tagProfile = node.querySelector('.tag-profile');
    if (tagProfile) tagProfile.textContent = formatProfile(recipe.profile);

    const tagDuration = node.querySelector('.tag-duration');
    if (tagDuration) tagDuration.textContent = formatDurationShort(recipe.prepTime);

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
    state.filters.profile !== 'all' ||
    state.filters.duration !== 'all' ||
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

  const ingredients = recipe.ingredients.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const steps = recipe.steps.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  el.detailBody.innerHTML = `
    <section class="detail-hero">
      <img src="${escapeAttribute(recipe.image || createPlaceholderImage(recipe.title))}" alt="${escapeAttribute(
        recipe.title
      )}" class="detail-img" />
      <div class="detail-meta">
        <span class="detail-pill">${escapeHtml(recipe.type)}</span>
        <span class="detail-pill">${escapeHtml(formatProfile(recipe.profile))}</span>
        <span class="detail-pill">${recipe.prepTime ? `${recipe.prepTime} min` : 'Sin tiempo'}</span>
      </div>
    </section>

    <section class="detail-section">
      <h3>Descripcion</h3>
      <p class="detail-text">${escapeHtml(recipe.notes || 'Sin descripcion adicional.')}</p>
    </section>

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

  showDialog(el.detailDialog);
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
  state.filters.profile = 'all';
  state.filters.duration = 'all';
  state.filters.sort = 'updated_desc';

  if (el.searchInput) el.searchInput.value = '';
  if (el.typeFilter) el.typeFilter.value = 'all';
  if (el.profileFilter) el.profileFilter.value = 'all';
  if (el.timeFilter) el.timeFilter.value = 'all';
  if (el.sortSelect) el.sortSelect.value = 'updated_desc';

  renderRecipes();
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
  return `${clean.slice(0, maxLen - 10)}... ver más`;
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

function matchesDurationFilter(prepTime, mode) {
  const hasTime = Number.isFinite(prepTime) && prepTime > 0;
  if (mode === 'all') return true;
  if (mode === 'unknown') return !hasTime;
  if (!hasTime) return false;
  if (mode === 'short') return prepTime <= 20;
  if (mode === 'medium') return prepTime >= 21 && prepTime <= 45;
  if (mode === 'long') return prepTime >= 46 && prepTime <= 90;
  if (mode === 'xlong') return prepTime > 90;
  return true;
}

function formatDurationShort(prepTime) {
  if (!Number.isFinite(prepTime) || prepTime <= 0) return 'Sin tiempo';
  return `${prepTime} min`;
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
    return;
  }
  dialog.setAttribute('open', 'open');
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) {
    dialog.close();
    return;
  }
  dialog.removeAttribute('open');
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
        <span class="tag card-tag tag-profile"></span>
        <span class="tag card-tag tag-duration"></span>
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
      title: 'Bizcocho de platano en Thermomix (receta definitiva)',
      type: 'Bizcocho',
      profile: 'dulce',
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
      updatedAt: '2026-04-07T00:00:00.000Z',
    },
    {
      id: 'seed-apple-thermomix',
      title: 'Bizcocho de manzana perfecto (Thermomix)',
      type: 'Bizcocho',
      profile: 'dulce',
      prepTime: 55,
      image: 'assets/images/recipes/bizcocho-manzana-thermomix.jpg',
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
      updatedAt: '2026-04-07T00:00:00.000Z',
    },
  ];
}
