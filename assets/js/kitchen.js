const $ = (selector) => document.querySelector(selector);
const html = escapeHtml;
const attr = (value) => html(value).replaceAll('"', "&quot;");
const memory = new Map();
function read(key, fallback, storage = localStorage) {
  try {
    return JSON.parse(storage.getItem("recetario:" + key)) ?? fallback;
  } catch {
    return memory.get(key) ?? fallback;
  }
}
function save(key, value, storage = localStorage) {
  memory.set(key, value);
  try {
    storage.setItem("recetario:" + key, JSON.stringify(value));
  } catch {
    alert("El navegador no ha podido guardar los cambios.");
  }
}
function recipeLink(id, variant, cooking) {
  const params = new URLSearchParams();
  if (variant) params.set("variante", variant);
  if (cooking) params.set("cocina", "1");
  return (
    "#/recetas/" + encodeURIComponent(id) + (params.size ? "?" + params : "")
  );
}
function renderChips() {
  $("#chips").replaceChildren(
    ...Array.from(el.typeFilter.options, (option) => {
      const button = document.createElement("button");
      button.textContent = option.text;
      button.setAttribute("aria-pressed", option.value === state.filters.type);
      button.onclick = () => {
        el.typeFilter.value = option.value;
        el.typeFilter.dispatchEvent(new Event("change"));
      };
      return button;
    }),
  );
}
$("#filters").onclick = () => $("#filterBox").showModal();
let active, wake, timerInterval;
async function keepAwake() {
  if (!active?.cooking || document.hidden || !navigator.wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (active?.cooking) wake = lock;
    else await lock.release();
  } catch {}
}
document.addEventListener("visibilitychange", keepAwake);
window.addEventListener("hashchange", route);
function route() {
  clearInterval(timerInterval);
  if (wake) {
    wake.release().catch(() => {});
    wake = null;
  }
  const [path, query] = location.hash.slice(1).split("?");
  const recipe = state.recipes.find(
    (r) => path === "/recetas/" + encodeURIComponent(r.id),
  );
  active = null;
  $(".container").hidden = !!recipe;
  $("#page").hidden = !recipe;
  document.title = recipe ? recipe.title + " · Mis recetas" : "Mis recetas";
  if (!recipe) return;
  const params = new URLSearchParams(query);
  const variant =
    recipe.variants.find((v) => v.id === params.get("variante")) ||
    recipe.variants.find((v) => v.id === read("last:" + recipe.id, "")) ||
    recipe.variants[0];
  if (variant) save("last:" + recipe.id, variant.id);
  const detail = variant || recipe;
  const key = JSON.stringify([recipe.id, variant?.id || ""]);
  const session = read(
    key,
    { scale: 1, checked: [], step: 0, done: [], timers: [] },
    sessionStorage,
  );
  const steps = getDetailSteps(recipe, variant);
  session.step = Math.max(0, Math.min(session.step, steps.length - 1));
  active = {
    recipe,
    variant,
    detail,
    key,
    session,
    steps,
    cooking: params.has("cocina") && steps.length > 0,
  };
  el.detailTitle.textContent = recipe.title;
  draw();
  window.scrollTo(0, 0);
  el.detailTitle.focus({ preventScroll: true });
  keepAwake();
}
function persist() {
  save(active.key, active.session, sessionStorage);
}
function button(label, action, primary = false) {
  return (
    '<button type="button" data-act="' +
    action +
    '" class="' +
    (primary ? "primary" : "") +
    '">' +
    html(label) +
    "</button>"
  );
}
// Only scale an isolated measurement with an unambiguous unit and no secondary quantity.
function measurement(line) {
  const match = line.match(/^(\d+(?:[.,]\d+)?)\s+(kg|g|ml|l)\s+([^\d/½¼¾]+)$/i);
  return (
    match && {
      amount: Number(match[1].replace(",", ".")),
      unit: match[2],
      name: match[3],
    }
  );
}
const decimal = (n) =>
  Number(n.toFixed(3)).toLocaleString("es-ES", { maximumFractionDigits: 3 });
function ingredients() {
  const { recipe, variant, session } = active;
  return getDetailIngredients(recipe, variant).map((line) => {
    const m = measurement(line);
    return m && session.scale !== 1
      ? decimal(m.amount * session.scale) + " " + m.unit + " " + m.name
      : line;
  });
}
function checks() {
  return ingredients()
    .map((line, i) =>
      line.startsWith("Grupo: ")
        ? "<h3>" + html(line.slice(7)) + "</h3>"
        : '<label class="check"><input type="checkbox" data-item="' +
          i +
          '" ' +
          (active.session.checked.includes(i) ? "checked" : "") +
          "><span>" +
          html(line) +
          "</span></label>",
    )
    .join("");
}
function draw() {
  const { recipe, variant, detail, session, steps, cooking, key } = active;
  const body = el.detailBody;
  if (cooking) {
    const step = steps[session.step];
    const matches = [
      ...step.matchAll(
        /(?<![\d.,/–-])(\d+)\s*(minutos?|min|horas?|h|segundos?|seg)\b/gi,
      ),
    ].filter((m) => !/(?:\d\s*[-–a/]\s*)$/.test(step.slice(0, m.index)));
    body.innerHTML =
      '<section class="cooking"><p>' +
      html(variant?.title || recipe.type) +
      '</p><progress value="' +
      (session.step + 1) +
      '" max="' +
      steps.length +
      '"></progress><h2>Paso ' +
      (session.step + 1) +
      " de " +
      steps.length +
      '</h2><p class="instruction">' +
      html(step) +
      '</p><label class="check"><input id="done" type="checkbox" ' +
      (session.done.includes(session.step) ? "checked" : "") +
      '>Paso completado</label><div class="actions">' +
      (session.step ? button("Anterior", "prev") : "") +
      (session.step < steps.length - 1
        ? button("Siguiente", "next", true)
        : button("Finalizar sesión", "finish", true)) +
      button("Salir", "exit") +
      "</div><details><summary>Ingredientes</summary>" +
      checks() +
      "</details><h3>Temporizadores</h3>" +
      matches
        .map((m) =>
          button(
            "Iniciar " + m[0],
            "timer:" +
              Number(m[1]) *
                (/^h/i.test(m[2]) ? 3600 : /^m/i.test(m[2]) ? 60 : 1),
          ),
        )
        .join(" ") +
      '<form id="manual"><label>Minutos<input required type="number" min=".01" max="10080" step="any"></label><button>Iniciar temporizador</button></form><div id="timers"></div></section>';
    const extra = detail.stepDetails?.[session.step];
    if (extra?.minutes)
      $("#manual").insertAdjacentHTML(
        "beforebegin",
        button(
          "Iniciar " + extra.minutes + " min",
          "timer:" + extra.minutes * 60,
        ),
      );
    if (extra?.image) {
      const image = document.createElement("img");
      image.className = "detail-img";
      image.alt = "Paso " + (session.step + 1);
      image.src = extra.image;
      $(".instruction").after(image);
    }
    $("#manual").onsubmit = (e) => {
      e.preventDefault();
      startTimer(Number($("#manual input").value) * 60);
    };
    $("#done").onchange = (e) => {
      session.done = session.done.filter((i) => i !== session.step);
      if (e.target.checked) session.done.push(session.step);
      persist();
    };
    tick();
    clearInterval(timerInterval);
    timerInterval = setInterval(tick, 1000);
  } else {
    const images = getDetailImages(recipe, variant);
    const selector =
      recipe.variants.length > 1
        ? '<h3>Elige cómo quieres prepararla</h3><div class="variant-switcher">' +
          recipe.variants
            .map(
              (v, i) =>
                '<button aria-pressed="' +
                (v === variant) +
                '" data-act="variant:' +
                i +
                '">' +
                html(v.label) +
                " · " +
                html(v.title) +
                "<small>" +
                html(v.summary) +
                "</small></button>",
            )
            .join("") +
          "</div>"
        : "";
    body.innerHTML =
      "<p>" +
      html(recipe.notes) +
      '</p><img class="detail-img" alt="' +
      attr(recipe.title) +
      '"><div class="gallery">' +
      (images.length > 1
        ? images.map((_, i) => button("Foto " + (i + 1), "image:" + i)).join("")
        : "") +
      "</div>" +
      selector +
      (variant
        ? "<h2>" +
          html(variant.title) +
          "</h2><p>" +
          html(variant.summary) +
          "</p>"
        : "") +
      "<p>" +
      [
        recipe.type,
        formatProfile(recipe.profile),
        detail.difficulty && formatDifficulty(detail.difficulty),
        detail.prepTime && detail.prepTime + " min",
      ]
        .filter(Boolean)
        .map(html)
        .join(" · ") +
      "</p>" +
      (detail.learns?.length
        ? "<h3>Qué aprenderás</h3><ul>" +
          detail.learns.map((s) => "<li>" + html(s) + "</li>").join("") +
          "</ul>"
        : "") +
      '<div class="actions">' +
      (steps.length ? button("Empezar a cocinar", "cook", true) : "") +
      button("Editar receta", "edit") +
      '</div><div class="columns"><section><h2>Ingredientes</h2><label>Multiplicar cantidades<input id="scale" type="number" min=".01" max="100" step="any" value="' +
      session.scale +
      '"></label><small>Solo se ajustan medidas inequívocas en g, kg, ml o l.</small><div class="actions">' +
      button("Restablecer ×1", "original") +
      "</div>" +
      checks() +
      '<div class="actions">' +
      button("Desmarcar todos", "clear") +
      button("Añadir a la compra", "shop") +
      "</div></section><section><h2>Preparación</h2><ol>" +
      steps.map((s) => "<li>" + html(s) + "</li>").join("") +
      '</ol></section></div><label><h3>Notas personales</h3><textarea id="personal" placeholder="Tus observaciones sobre esta preparación"></textarea></label><small>Se guardan en este navegador.</small>';
    const timings = Object.entries(detail.times || {}).filter(
      ([, minutes]) => minutes > 0,
    );
    if (detail.yields || timings.length) {
      const info = document.createElement("p");
      info.textContent = [
        detail.yields,
        ...timings.map(([name, min]) => name + " · " + min + " min"),
      ]
        .filter(Boolean)
        .join(" / ");
      body.querySelector(".columns").before(info);
    }
    $(".detail-img").onerror = (e) => {
      e.target.onerror = null;
      e.target.src = createPlaceholderImage(recipe.title);
    };
    $(".detail-img").src = images[0];
    $("#personal").value = read("notes:" + key, "");
    $("#personal").oninput = (e) => save("notes:" + key, e.target.value);
    $("#scale").onchange = (e) => {
      if (e.target.value && e.target.reportValidity()) {
        session.scale = Number(e.target.value);
        persist();
        draw();
      }
    };
  }
  body.querySelectorAll("[data-item]").forEach(
    (input) =>
      (input.onchange = () => {
        const i = Number(input.dataset.item);
        session.checked = session.checked.filter((n) => n !== i);
        if (input.checked) session.checked.push(i);
        persist();
      }),
  );
}
el.detailBody.onclick = (e) => {
  const control = e.target.closest("[data-act]");
  if (!control) return;
  const [action, arg] = control.dataset.act.split(":");
  const { recipe, variant, session } = active;
  switch (action) {
    case "cook":
      location.hash = recipeLink(recipe.id, variant?.id, true);
      break;
    case "finish":
      if (
        !confirm(
          "¿Finalizar esta sesión y restablecer sus pasos, ingredientes y temporizadores?",
        )
      )
        return;
      sessionStorage.removeItem("recetario:" + active.key);
    case "exit":
      location.hash = recipeLink(recipe.id, variant?.id);
      break;
    case "variant":
      location.hash = recipeLink(recipe.id, recipe.variants[Number(arg)].id);
      break;
    case "image":
      $(".detail-img").src = getDetailImages(recipe, variant)[Number(arg)];
      break;
    case "prev":
    case "next":
      session.step += action === "next" ? 1 : -1;
      persist();
      draw();
      window.scrollTo(0, 0);
      break;
    case "clear":
      session.checked = [];
      persist();
      draw();
      break;
    case "original":
      session.scale = 1;
      persist();
      draw();
      break;
    case "timer":
      startTimer(Number(arg));
      break;
    case "cancel":
      session.timers.splice(Number(arg), 1);
      persist();
      tick();
      break;
    case "pause": {
      const t = session.timers[arg];
      if (t.end) {
        t.left = Math.max(0, t.end - Date.now());
        t.end = null;
      } else t.end = Date.now() + t.left;
      persist();
      tick();
      break;
    }
    case "edit":
      editRecipe(recipe);
      break;
    case "shop":
      addShopping();
      break;
  }
};
function startTimer(seconds) {
  active.session.timers.push({
    end: Date.now() + seconds * 1000,
    left: seconds * 1000,
  });
  persist();
  tick();
}
function tick() {
  const box = $("#timers");
  if (!box || !active?.cooking) return;
  const markup = active.session.timers
    .map((t, i) => {
      const seconds = Math.max(
        0,
        Math.ceil((t.end ? t.end - Date.now() : t.left) / 1000),
      );
      return (
        '<div class="actions">' +
        (seconds
          ? Math.floor(seconds / 60) + " min " + (seconds % 60) + " s"
          : '<strong role="alert">Tiempo cumplido</strong>') +
        " " +
        (seconds ? button(t.end ? "Pausar" : "Reanudar", "pause:" + i) : "") +
        button("Cancelar", "cancel:" + i) +
        "</div>"
      );
    })
    .join("");
  if (box.innerHTML !== markup) box.innerHTML = markup;
}
