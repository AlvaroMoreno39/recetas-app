const STORAGE_KEY = 'recetas_app_v3';
const ADMIN_PASSWORD_SHA256 = 'f3f725e47f3efeb1e84c7d1be08f8d2af1e2a86736e75f6fc1444a081680c711';
const FIELD_ALIASES = { type: 'category', profile: 'difficulty' };
const BACKEND_CONFIG = window.RECETAS_BACKEND || {};
const SYNC_ROW_ID = safeString(BACKEND_CONFIG.rowId) || 'global';
const SYNC_TABLE = safeString(BACKEND_CONFIG.table) || 'recipes_state';

const state = {
  recipes: [],
  editingId: null,
  isAdmin: false,
  backendOnline: false,
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
  btnNew: document.getElementById('btnNew'),
  btnNewEmpty: document.getElementById('btnNewEmpty'),
  btnExport: document.getElementById('btnExport'),
  importInput: document.getElementById('importInput'),
  searchInput: document.getElementById('searchInput'),
  typeFilter: document.getElementById('typeFilter') || document.getElementById('categoryFilter'),
  profileFilter: document.getElementById('profileFilter') || document.getElementById('difficultyFilter'),
  timeFilter: document.getElementById('timeFilter'),
  sortSelect: document.getElementById('sortSelect'),
  activeFilters: document.getElementById('activeFilters'),
  resultsLabel: document.getElementById('resultsLabel'),
  btnClearFilters: document.getElementById('btnClearFilters'),
  formDialog: document.getElementById('formDialog'),
  detailDialog: document.getElementById('detailDialog'),
  adminDialog: document.getElementById('adminDialog'),
  form: document.getElementById('recipeForm'),
  formHeading: document.getElementById('formHeading'),
  formError: document.getElementById('formError'),
  imageFile: document.getElementById('imageFile'),
  detailTitle: document.getElementById('detailTitle'),
  detailBody: document.getElementById('detailBody'),
  cardTpl: document.getElementById('cardTpl'),
  toast: document.getElementById('toast'),
  adminStatusChip: document.getElementById('adminStatusChip'),
  btnAdminOpen: document.getElementById('btnAdminOpen'),
  adminLoginForm: document.getElementById('adminLoginForm'),
  adminPassword: document.getElementById('adminPassword'),
  btnTogglePassword: document.getElementById('btnTogglePassword'),
  adminActions: document.getElementById('adminActions'),
  adminSession: document.getElementById('adminSession'),
  adminHint: document.getElementById('adminHint'),
  btnAdminLogout: document.getElementById('btnAdminLogout'),
};

let toastTimer = null;

void startApp();

async function startApp() {
  try {
    await init();
  } catch (error) {
    console.error('[recetas-app] init_error', error);
  }
}

async function init() {
  state.isAdmin = false;
  state.recipes = await loadRecipes();

  bindEvents();
  applyAdminState();
  renderTypeFilter();
  renderRecipes();
}

function bindEvents() {
  if (el.btnNew) el.btnNew.addEventListener('click', () => openForm());
  if (el.btnNewEmpty) el.btnNewEmpty.addEventListener('click', () => openForm());

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

  if (el.btnClearFilters) el.btnClearFilters.addEventListener('click', clearFilters);
  if (el.form) el.form.addEventListener('submit', onSubmitForm);

  document.querySelectorAll('[data-close-form]').forEach((button) => button.addEventListener('click', closeForm));
  document.querySelectorAll('[data-close-detail]').forEach((button) => button.addEventListener('click', closeDetail));
  document.querySelectorAll('[data-close-admin]').forEach((button) => button.addEventListener('click', closeAdminDialog));

  if (el.btnExport) {
    el.btnExport.addEventListener('click', () => {
      if (!requireAdmin()) return;
      exportRecipes();
    });
  }

  if (el.importInput) {
    el.importInput.addEventListener('change', (event) => {
      if (!state.isAdmin) {
        event.target.value = '';
        showToast('Solo admin puede importar recetas.');
        return;
      }
      importRecipes(event);
    });
  }

  if (el.grid) el.grid.addEventListener('click', onGridClick);

  if (el.btnAdminOpen) el.btnAdminOpen.addEventListener('click', openAdminDialog);
  if (el.adminLoginForm) el.adminLoginForm.addEventListener('submit', onAdminLogin);
  if (el.btnAdminLogout) el.btnAdminLogout.addEventListener('click', adminLogout);

  if (el.btnTogglePassword) {
    el.btnTogglePassword.addEventListener('click', () => {
      const show = el.adminPassword?.type === 'password';
      if (!el.adminPassword) return;
      el.adminPassword.type = show ? 'text' : 'password';
      el.btnTogglePassword.textContent = show ? 'Ocultar' : 'Mostrar';
    });
  }

  document.addEventListener('keydown', (event) => {
    if (shouldIgnoreShortcut(event.target)) return;
    if (event.key === '/' && el.searchInput) {
      event.preventDefault();
      el.searchInput.focus();
    }
    if ((event.key === 'n' || event.key === 'N') && state.isAdmin) {
      event.preventDefault();
      openForm();
    }
  });
}

function applyAdminState() {
  document.body.classList.toggle('is-admin', state.isAdmin);
  if (el.adminActions) el.adminActions.hidden = !state.isAdmin;
  if (el.adminSession) el.adminSession.hidden = !state.isAdmin;
  if (el.adminLoginForm) el.adminLoginForm.hidden = state.isAdmin;

  const syncLabel = isBackendConfigured()
    ? state.backendOnline
      ? 'Nube conectada'
      : 'Nube no disponible (guardado local)'
    : 'Sin backend (guardado local)';

  if (state.isAdmin) {
    if (el.adminHint) el.adminHint.textContent = `Sesion admin activa. Puedes crear, editar, importar y exportar. ${syncLabel}.`;
    if (el.adminStatusChip) {
      el.adminStatusChip.textContent = 'Admin activo';
      el.adminStatusChip.classList.add('is-admin');
    }
  } else {
    if (el.adminHint) el.adminHint.textContent = `Acceso privado: inicia sesion para gestionar recetas. ${syncLabel}.`;
    if (el.adminStatusChip) {
      el.adminStatusChip.textContent = 'Solo lectura';
      el.adminStatusChip.classList.remove('is-admin');
    }
  }
}

function openAdminDialog() {
  if (el.btnAdminOpen) el.btnAdminOpen.blur();
  if (el.adminActions) el.adminActions.hidden = !state.isAdmin;
  if (el.adminSession) el.adminSession.hidden = !state.isAdmin;
  if (el.adminLoginForm) el.adminLoginForm.hidden = state.isAdmin;
  showDialog(el.adminDialog);
  if (!state.isAdmin && el.adminPassword) el.adminPassword.focus();
}

function closeAdminDialog() {
  closeDialog(el.adminDialog);
}

async function onAdminLogin(event) {
  event.preventDefault();
  const raw = safeString(el.adminPassword?.value);
  if (!raw) {
    showToast('Escribe la contrasena.');
    return;
  }

  const hash = await sha256(raw);
  if (hash !== ADMIN_PASSWORD_SHA256) {
    showToast('Contrasena incorrecta.');
    return;
  }

  state.isAdmin = true;
  if (el.adminPassword) el.adminPassword.value = '';
  if (el.adminPassword) el.adminPassword.type = 'password';
  if (el.btnTogglePassword) el.btnTogglePassword.textContent = 'Mostrar';

  applyAdminState();
  renderRecipes();
  closeAdminDialog();
  showToast('Modo admin activado');
}

function adminLogout() {
  state.isAdmin = false;
  closeForm();
  applyAdminState();
  renderRecipes();
  showToast('Sesion admin cerrada');
  window.location.reload();
}

function requireAdmin() {
  if (state.isAdmin) return true;
  showToast('Accion disponible solo en modo admin.');
  return false;
}

async function onSubmitForm(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  if (!el.form || !el.formError) return;
  el.formError.textContent = '';

  const formData = new FormData(el.form);
  const uploadedImage = await readFileAsDataUrl(el.imageFile?.files?.[0]);
  const existing = state.recipes.find((item) => item.id === state.editingId);

  const typedImageUrl = value(formData, 'image');

  const normalizedImage = (() => {
    if (uploadedImage) return normalizeImageUrl(uploadedImage);
    if (typedImageUrl) return normalizeImageUrl(typedImageUrl);

    if (state.editingId) {
      const hadHttpImage = Boolean(existing?.image && /^https?:\/\//i.test(existing.image));
      if (hadHttpImage) return '';
      return normalizeImageUrl(existing?.image || '');
    }

    return '';
  })();

  if (!uploadedImage && typedImageUrl && !normalizedImage) {
    showToast('Ese enlace no es imagen directa. Usa URL directa .jpg/.png o sube archivo.');
  }

  const recipe = {
    id: state.editingId ?? createId(),
    title: value(formData, 'title'),
    type: value(formData, 'type'),
    profile: normalizeProfile(value(formData, 'profile') || 'salado'),
    prepTime: positiveNumberOrNull(value(formData, 'prepTime')),
    image: normalizedImage,
    ingredients: toLines(value(formData, 'ingredients')),
    steps: toLines(value(formData, 'steps')),
    notes: value(formData, 'notes'),
    updatedAt: new Date().toISOString(),
  };

  const validationError = validateRecipe(recipe);
  if (validationError) {
    el.formError.textContent = validationError;
    return;
  }

  if (state.editingId) {
    state.recipes = state.recipes.map((item) => (item.id === state.editingId ? recipe : item));
    showToast('Receta actualizada');
  } else {
    state.recipes.unshift(recipe);
    showToast('Receta guardada');
  }

  await persist();
  renderTypeFilter();
  renderRecipes();
  closeForm();
}

function validateRecipe(recipe) {
  if (!recipe.title) return 'El titulo es obligatorio.';
  if (!recipe.type) return 'El tipo es obligatorio.';
  if (!recipe.profile) return 'El sabor es obligatorio.';
  if (recipe.ingredients.length === 0) return 'Agrega al menos 1 ingrediente.';
  if (recipe.steps.length === 0) return 'Agrega al menos 1 paso.';
  return '';
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
      thumb.addEventListener('error', () => {
        thumb.src = createPlaceholderImage(recipe.title);
      });
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

    node.querySelectorAll('.admin-only').forEach((adminNode) => {
      adminNode.hidden = !state.isAdmin;
    });

    fragment.append(node);
  });

  el.grid.append(fragment);
  updateStatus(list.length);
  renderActiveFilters();
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

function renderActiveFilters() {
  if (!el.activeFilters) return;

  const chips = [];
  if (state.filters.query) chips.push(state.filters.query);
  if (state.filters.type !== 'all') chips.push(state.filters.type);
  if (state.filters.profile !== 'all') chips.push(formatProfile(state.filters.profile));
  if (state.filters.duration !== 'all' && el.timeFilter) chips.push(el.timeFilter.selectedOptions[0].textContent);
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

  if (![...el.typeFilter.options].some((opt) => opt.value === state.filters.type)) {
    state.filters.type = 'all';
  }

  el.typeFilter.value = state.filters.type;
}

function openForm(recipeId = null) {
  if (!requireAdmin()) return;
  if (!el.form || !el.formHeading || !el.formError) return;

  state.editingId = recipeId;
  el.formError.textContent = '';
  el.form.reset();
  if (el.imageFile) el.imageFile.value = '';

  if (recipeId) {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (!recipe) return;

    el.formHeading.textContent = 'Editar receta';
    setFormValue('title', recipe.title);
    setFormValue('type', recipe.type);
    setFormValue('profile', recipe.profile || 'salado');
    setFormValue('prepTime', recipe.prepTime);
    setFormValue('image', recipe.image && recipe.image.startsWith('http') ? recipe.image : '');
    setFormValue('ingredients', recipe.ingredients.join('\n'));
    setFormValue('steps', recipe.steps.join('\n'));
    setFormValue('notes', recipe.notes);
  } else {
    el.formHeading.textContent = 'Nueva receta';
  }

  showDialog(el.formDialog);
}

function closeForm() {
  state.editingId = null;
  closeDialog(el.formDialog);
}

function openDetail(recipeId) {
  if (!el.detailTitle || !el.detailBody) return;

  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) return;

  el.detailTitle.textContent = recipe.title;

  const ingredients = recipe.ingredients.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const steps = recipe.steps.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  el.detailBody.innerHTML = `
    <img src="${escapeAttribute(recipe.image || createPlaceholderImage(recipe.title))}" alt="${escapeAttribute(
      recipe.title
    )}" class="detail-img" />
    <div class="tags">
      <span class="tag">${escapeHtml(recipe.type)}</span>
      <span class="tag">${escapeHtml(formatProfile(recipe.profile))}</span>
      ${recipe.prepTime ? `<span class="tag">${recipe.prepTime} min</span>` : ''}
    </div>
    <h3>Descripcion</h3>
    <p>${escapeHtml(recipe.notes || 'Sin descripcion adicional.')}</p>
    <h3>Ingredientes</h3>
    <ul class="list">${ingredients}</ul>
    <h3>Pasos</h3>
    <ol class="list">${steps}</ol>
  `;

  const detailImg = el.detailBody.querySelector('.detail-img');
  if (detailImg) {
    detailImg.referrerPolicy = 'no-referrer';
    detailImg.addEventListener('error', () => {
      detailImg.src = createPlaceholderImage(recipe.title);
    });
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
    return;
  }
  if (button.classList.contains('btn-edit')) {
    openForm(recipeId);
    return;
  }
  if (button.classList.contains('btn-delete')) {
    if (!requireAdmin()) return;
    void deleteRecipe(recipeId);
  }
}

async function deleteRecipe(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) return;
  if (!confirm(`Seguro que quieres eliminar "${recipe.title}"?`)) return;

  state.recipes = state.recipes.filter((item) => item.id !== recipeId);
  await persist();
  renderTypeFilter();
  renderRecipes();
  showToast('Receta eliminada');
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

async function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recipes));
  if (!isBackendConfigured()) return;
  try {
    await pushRecipesToBackend(state.recipes);
    state.backendOnline = true;
    applyAdminState();
  } catch (error) {
    state.backendOnline = false;
    applyAdminState();
    console.error('[recetas-app] persist_backend_error', error);
    showToast('Guardado local OK. Nube no disponible ahora.');
  }
}

function loadRecipesLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed
      .filter((item) => item && typeof item === 'object')
      .map(normalizeRecipe)
      .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));

    return normalized;
  } catch {
    return [];
  }
}

async function loadRecipes() {
  const localRecipes = loadRecipesLocal();
  if (!isBackendConfigured()) {
    return localRecipes.length > 0 ? localRecipes : seed();
  }

  try {
    const remoteRecipes = await pullRecipesFromBackend();
    state.backendOnline = true;

    if (remoteRecipes.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteRecipes));
      return remoteRecipes;
    }

    const initial = localRecipes.length > 0 ? localRecipes : seed();
    await pushRecipesToBackend(initial);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  } catch (error) {
    state.backendOnline = false;
    console.error('[recetas-app] load_backend_error', error);
    return localRecipes.length > 0 ? localRecipes : seed();
  }
}

function isBackendConfigured() {
  return Boolean(safeString(BACKEND_CONFIG.url) && safeString(BACKEND_CONFIG.anonKey));
}

function backendHeaders() {
  const key = safeString(BACKEND_CONFIG.anonKey);
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function pullRecipesFromBackend() {
  const urlBase = safeString(BACKEND_CONFIG.url).replace(/\/+$/, '');
  const endpoint = `${urlBase}/rest/v1/${encodeURIComponent(SYNC_TABLE)}?id=eq.${encodeURIComponent(SYNC_ROW_ID)}&select=recipes`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: backendHeaders(),
  });
  if (!response.ok) {
    throw new Error(`pull_failed_${response.status}`);
  }
  const rows = await response.json();
  const recipes = Array.isArray(rows) && rows[0] ? rows[0].recipes : [];
  if (!Array.isArray(recipes)) return [];
  return recipes.map(normalizeRecipe).sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));
}

async function pushRecipesToBackend(recipes) {
  const urlBase = safeString(BACKEND_CONFIG.url).replace(/\/+$/, '');
  const endpoint = `${urlBase}/rest/v1/${encodeURIComponent(SYNC_TABLE)}?on_conflict=id`;
  const body = [
    {
      id: SYNC_ROW_ID,
      recipes,
      updated_at: new Date().toISOString(),
    },
  ];
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...backendHeaders(),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`push_failed_${response.status}`);
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

function seed() {
  return [
    {
      id: createId(),
      title: 'Bizcocho de platano en Thermomix (receta definitiva)',
      type: 'Bizcocho',
      profile: 'dulce',
      prepTime: 50,
      image: '',
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
        'Opcional: 70-80 g pepitas de chocolate o 40 g nueces'
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
        'Conservacion: envolver en film y guardar a temperatura ambiente (2-3 dias).'
      ],
      notes: 'Bizcocho jugoso y aromatico para aprovechar platanos maduros.',
      updatedAt: new Date().toISOString()
    },
    {
      id: createId(),
      title: 'Bizcocho de manzana perfecto (Thermomix)',
      type: 'Bizcocho',
      profile: 'dulce',
      prepTime: 55,
      image: '',
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
        '2 manzanas en daditos (peladas)'
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
        'Enfriar 10-15 min en molde y despues desmoldar.'
      ],
      notes: 'Trucos clave: no sobrebatir la harina, manzana en dados pequenos, 2 manzanas para jugosidad y canela + vainilla para sabor.',
      updatedAt: new Date().toISOString()
    }
  ];
}

function exportRecipes() {
  const blob = new Blob([JSON.stringify(state.recipes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `recetas-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('Exportacion completada');
}

async function importRecipes(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      alert('El archivo no contiene una lista de recetas valida.');
      return;
    }

    state.recipes = parsed
      .map(normalizeRecipe)
      .filter((recipe) => recipe.title && recipe.type)
      .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));

    await persist();
    renderTypeFilter();
    renderRecipes();
    showToast('Importacion completada');
  } catch {
    alert('No se pudo importar el archivo. Verifica que sea JSON valido.');
  } finally {
    event.target.value = '';
  }
}

function showToast(message) {
  if (!el.toast) return;

  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.hidden = false;

  requestAnimationFrame(() => el.toast.classList.add('show'));
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');
    setTimeout(() => {
      el.toast.hidden = true;
    }, 220);
  }, 1900);
}

function shouldIgnoreShortcut(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function resolveFieldName(name) {
  if (el.form?.elements?.[name]) return name;
  const alias = FIELD_ALIASES[name];
  if (alias && el.form?.elements?.[alias]) return alias;
  return name;
}

function setFormValue(name, value) {
  const resolved = resolveFieldName(name);
  if (!el.form?.elements?.[resolved]) return;
  el.form.elements[resolved].value = value ?? '';
}

function value(formData, key) {
  const resolved = resolveFieldName(key);
  return safeString(formData.get(resolved));
}

function safeString(value) {
  return String(value ?? '').trim();
}

function toLines(text) {
  return safeString(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
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
  return `${clean.slice(0, maxLen - 4)} etc`;
}

function normalizeProfile(value) {
  const normalized = safeString(value).toLowerCase();
  if (normalized === 'facil') return 'salado';
  if (normalized === 'media') return 'mixto';
  if (normalized === 'alta') return 'salado';
  if (normalized === 'dulce' || normalized === 'salado' || normalized === 'mixto') return normalized;
  return 'salado';
}

function formatProfile(value) {
  const normalized = normalizeProfile(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function inferProfileFromLegacy(item) {
  const profile = safeString(item.profile).toLowerCase();
  if (profile) return profile;

  const difficulty = safeString(item.difficulty).toLowerCase();
  if (difficulty === 'media') return 'mixto';
  if (difficulty === 'alta' || difficulty === 'facil') return 'salado';

  const category = safeString(item.category).toLowerCase();
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

function readFileAsDataUrl(file) {
  if (!file) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('file_read_error'));
    reader.readAsDataURL(file);
  });
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

async function sha256(text) {
  if (!window.crypto?.subtle) return '';
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const digestArray = Array.from(new Uint8Array(digest));
  return digestArray.map((value) => value.toString(16).padStart(2, '0')).join('');
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
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
      <button type="button" class="btn btn-soft btn-edit admin-only">Editar</button>
      <button type="button" class="btn btn-danger btn-delete admin-only">Eliminar</button>
    </footer>
  `;
  return wrapper;
}






