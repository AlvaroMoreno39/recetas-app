const STORAGE_KEY = 'recetas_app_v2';
const ADMIN_PASSWORD_SHA256 = 'f3f725e47f3efeb1e84c7d1be08f8d2af1e2a86736e75f6fc1444a081680c711';

const state = {
  recipes: loadRecipes(),
  editingId: null,
  isAdmin: false,
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
  typeFilter: document.getElementById('typeFilter'),
  profileFilter: document.getElementById('profileFilter'),
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

init();

function init() {
  state.isAdmin = false;

  const ensured = ensureBaseRecipes(state.recipes);
  if (ensured.length !== state.recipes.length) {
    state.recipes = ensured;
    persist();
  }

  bindEvents();
  applyAdminState();
  renderTypeFilter();
  renderRecipes();
}

function bindEvents() {
  el.btnNew.addEventListener('click', () => openForm());
  el.btnNewEmpty.addEventListener('click', () => openForm());

  const updateSearch = debounce((value) => {
    state.filters.query = safeString(value);
    renderRecipes();
  }, 140);

  el.searchInput.addEventListener('input', (event) => updateSearch(event.target.value));
  el.typeFilter.addEventListener('change', (event) => {
    state.filters.type = event.target.value;
    renderRecipes();
  });
  el.profileFilter.addEventListener('change', (event) => {
    state.filters.profile = event.target.value;
    renderRecipes();
  });
  el.timeFilter.addEventListener('change', (event) => {
    state.filters.duration = event.target.value;
    renderRecipes();
  });
  el.sortSelect.addEventListener('change', (event) => {
    state.filters.sort = event.target.value;
    renderRecipes();
  });

  el.btnClearFilters.addEventListener('click', clearFilters);
  el.form.addEventListener('submit', onSubmitForm);

  document.querySelectorAll('[data-close-form]').forEach((button) => button.addEventListener('click', closeForm));
  document.querySelectorAll('[data-close-detail]').forEach((button) => button.addEventListener('click', closeDetail));
  document.querySelectorAll('[data-close-admin]').forEach((button) => button.addEventListener('click', closeAdminDialog));

  el.btnExport.addEventListener('click', () => {
    if (!requireAdmin()) return;
    exportRecipes();
  });

  el.importInput.addEventListener('change', (event) => {
    if (!state.isAdmin) {
      event.target.value = '';
      showToast('Solo admin puede importar recetas.');
      return;
    }
    importRecipes(event);
  });

  el.grid.addEventListener('click', onGridClick);

  el.btnAdminOpen.addEventListener('click', openAdminDialog);
  el.adminLoginForm.addEventListener('submit', onAdminLogin);
  el.btnAdminLogout.addEventListener('click', adminLogout);

  el.btnTogglePassword.addEventListener('click', () => {
    const show = el.adminPassword.type === 'password';
    el.adminPassword.type = show ? 'text' : 'password';
    el.btnTogglePassword.textContent = show ? 'Ocultar' : 'Mostrar';
  });

  document.addEventListener('keydown', (event) => {
    if (shouldIgnoreShortcut(event.target)) return;
    if (event.key === '/') {
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
  el.adminActions.hidden = !state.isAdmin;
  el.adminSession.hidden = !state.isAdmin;
  el.adminLoginForm.hidden = state.isAdmin;

  if (state.isAdmin) {
    el.adminHint.textContent = 'Sesion admin activa. Puedes crear, editar, importar y exportar.';
    el.adminStatusChip.textContent = 'Admin activo';
    el.adminStatusChip.classList.add('is-admin');
  } else {
    el.adminHint.textContent = 'Acceso privado: inicia sesion para gestionar recetas.';
    el.adminStatusChip.textContent = 'Solo lectura';
    el.adminStatusChip.classList.remove('is-admin');
  }
}

function openAdminDialog() {
  el.btnAdminOpen.blur();
  el.adminActions.hidden = !state.isAdmin;
  el.adminSession.hidden = !state.isAdmin;
  el.adminLoginForm.hidden = state.isAdmin;
  el.adminDialog.showModal();
  if (!state.isAdmin) el.adminPassword.focus();
}

function closeAdminDialog() {
  if (el.adminDialog.open) el.adminDialog.close();
}

async function onAdminLogin(event) {
  event.preventDefault();
  const raw = safeString(el.adminPassword.value);
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
  el.adminPassword.value = '';
  el.adminPassword.type = 'password';
  el.btnTogglePassword.textContent = 'Mostrar';

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

  el.formError.textContent = '';
  const formData = new FormData(el.form);
  const uploadedImage = await readFileAsDataUrl(el.imageFile.files[0]);
  const existing = state.recipes.find((item) => item.id === state.editingId);

  const recipe = {
    id: state.editingId ?? crypto.randomUUID(),
    title: value(formData, 'title'),
    type: value(formData, 'type'),
    profile: normalizeProfile(value(formData, 'profile') || 'salado'),
    prepTime: positiveNumberOrNull(value(formData, 'prepTime')),
    image: uploadedImage || value(formData, 'image') || existing?.image || '',
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

  persist();
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

    const haystack = normalizeText([
      recipe.title,
      recipe.type,
      recipe.profile,
      recipe.notes,
      recipe.ingredients.join(' '),
      recipe.steps.join(' '),
    ].join(' '));

    const matchesQuery = tokens.every((token) => haystack.includes(token));
    return matchesType && matchesProfile && matchesDuration && matchesQuery;
  });

  return sortRecipes(filtered, state.filters.sort);
}

function renderRecipes() {
  const list = getProcessedRecipes();
  const fragment = document.createDocumentFragment();

  animateGridRefresh();
  el.grid.innerHTML = '';
  el.empty.hidden = list.length > 0;

  list.forEach((recipe, index) => {
    const node = el.cardTpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = recipe.id;
    node.style.animationDelay = `${Math.min(index * 35, 220)}ms`;

    const thumb = node.querySelector('.thumb');
    thumb.src = recipe.image || createPlaceholderImage(recipe.title);
    thumb.alt = recipe.title;

    node.querySelector('.title').textContent = recipe.title;
    node.querySelector('.tag-type').textContent = recipe.type;
    node.querySelector('.tag-profile').textContent = formatProfile(recipe.profile);
    node.querySelector('.tag-duration').textContent = formatDurationShort(recipe.prepTime);
    node.querySelector('.desc').textContent = buildCardDescription(recipe);

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
  const chips = [];
  if (state.filters.query) chips.push(`Busqueda: ${state.filters.query}`);
  if (state.filters.type !== 'all') chips.push(`Tipo: ${state.filters.type}`);
  if (state.filters.profile !== 'all') chips.push(`Sabor: ${formatProfile(state.filters.profile)}`);
  if (state.filters.duration !== 'all') chips.push(`Duracion: ${el.timeFilter.selectedOptions[0].textContent}`);
  if (state.filters.sort !== 'updated_desc') chips.push(`Orden: ${el.sortSelect.selectedOptions[0].textContent}`);

  el.activeFilters.innerHTML = '';
  chips.forEach((chip) => {
    const span = document.createElement('span');
    span.className = 'filter-chip';
    span.textContent = chip;
    el.activeFilters.append(span);
  });
}

function updateStatus(count) {
  el.resultsLabel.textContent = `${count} ${count === 1 ? 'receta' : 'recetas'}`;
  el.btnClearFilters.hidden = !hasActiveFilters();
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

  state.editingId = recipeId;
  el.formError.textContent = '';
  el.form.reset();
  el.imageFile.value = '';

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

  el.formDialog.showModal();
}

function closeForm() {
  state.editingId = null;
  if (el.formDialog.open) el.formDialog.close();
}

function openDetail(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) return;

  el.detailTitle.textContent = recipe.title;

  const ingredients = recipe.ingredients.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const steps = recipe.steps.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  el.detailBody.innerHTML = `
    <img src="${escapeAttribute(recipe.image || createPlaceholderImage(recipe.title))}" alt="${escapeAttribute(recipe.title)}" class="detail-img" />
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

  el.detailDialog.showModal();
}

function closeDetail() {
  if (el.detailDialog.open) el.detailDialog.close();
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
    deleteRecipe(recipeId);
  }
}

function deleteRecipe(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) return;
  if (!confirm(`Seguro que quieres eliminar "${recipe.title}"?`)) return;

  state.recipes = state.recipes.filter((item) => item.id !== recipeId);
  persist();
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

  el.searchInput.value = '';
  el.typeFilter.value = 'all';
  el.profileFilter.value = 'all';
  el.timeFilter.value = 'all';
  el.sortSelect.value = 'updated_desc';
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

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recipes));
}

function loadRecipes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seed();

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map(normalizeRecipe)
      .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));
  } catch {
    return seed();
  }
}

function normalizeRecipe(item) {
  const inferredType = safeString(item.type || item.category);
  const inferredProfile = safeString(item.profile || inferProfileFromLegacy(item));

  return {
    id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
    title: safeString(item.title),
    type: inferredType || 'General',
    profile: normalizeProfile(inferredProfile),
    prepTime: positiveNumberOrNull(item.prepTime),
    image: safeString(item.image),
    ingredients: Array.isArray(item.ingredients) ? item.ingredients.map(safeString).filter(Boolean) : [],
    steps: Array.isArray(item.steps) ? item.steps.map(safeString).filter(Boolean) : [],
    notes: safeString(item.notes),
    updatedAt: safeString(item.updatedAt) || new Date().toISOString(),
  };
}

function seed() {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Pasta rapida al ajo y aceite',
      type: 'Pasta',
      profile: 'salado',
      prepTime: 18,
      image: '',
      ingredients: ['200g pasta', '2 dientes de ajo', '3 cdas aceite de oliva', 'Sal y pimienta'],
      steps: ['Cocer la pasta.', 'Dorar el ajo en aceite.', 'Mezclar todo y ajustar sal.'],
      notes: 'Un clasico rapido para cuando tienes poco tiempo.',
      updatedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      title: 'Bowl mediterraneo',
      type: 'Ensalada',
      profile: 'salado',
      prepTime: 15,
      image: '',
      ingredients: ['Garbanzos', 'Tomate cherry', 'Pepino', 'Aceitunas', 'Queso feta'],
      steps: ['Lava y corta verduras.', 'Mezcla con los garbanzos.', 'Alina y sirve.'],
      notes: 'Ligero, fresco y muy facil para diario.',
      updatedAt: new Date().toISOString(),
    },
    bananaThermomixRecipe(),
  ];
}

function bananaThermomixRecipe() {
  return {
    id: crypto.randomUUID(),
    title: 'Bizcocho de platano en Thermomix (receta definitiva)',
    type: 'Bizcocho',
    profile: 'dulce',
    prepTime: 60,
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
      'Opcional: 70-80 g pepitas de chocolate o 40 g nueces',
    ],
    steps: [
      'Precalienta el horno a 180C con calor arriba y abajo.',
      'Tritura 3 platanos: 5 seg / vel 5.',
      'Anade huevos, azucar, mantequilla y aceite: 20 seg / vel 4.',
      'Si la mantequilla esta dura: 20 seg / 50C / vel 2 antes de mezclar.',
      'Anade harina, levadura, sal, leche y vainilla: 15 seg / vel 4.',
      'Opcional chocolate o nueces: 5 seg / giro inverso / vel 3.',
      'Vierte en molde plum cake engrasado o con papel de horno.',
      'Hornea a 180C entre 35 y 45 min (puede llegar a 50 min).',
      'Punto correcto: palillo con migas humedas sin masa liquida.',
      'Deja 10-15 min en el molde, desmolda y enfria 20-30 min antes de cortar.',
      'Conservacion: envolver en film y guardar a temperatura ambiente (2-3 dias).',
    ],
    notes: 'Bizcocho jugoso y aromatico para aprovechar platanos maduros.',
    updatedAt: new Date().toISOString(),
  };
}

function ensureBaseRecipes(recipes) {
  const list = [...recipes];
  const hasBanana = list.some(
    (recipe) => safeString(recipe.title).toLowerCase() === 'bizcocho de platano en thermomix (receta definitiva)'
  );
  if (!hasBanana) list.unshift(bananaThermomixRecipe());
  return list;
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

    state.recipes = ensureBaseRecipes(
      parsed
        .map(normalizeRecipe)
        .filter((recipe) => recipe.title && recipe.type)
        .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt))
    );

    persist();
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

function setFormValue(name, value) {
  el.form.elements[name].value = value ?? '';
}

function value(formData, key) {
  return safeString(formData.get(key));
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
