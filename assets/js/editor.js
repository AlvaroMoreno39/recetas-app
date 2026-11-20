const sheet = $("#sheet");
function loadEdits() {
  const recipes = new Map(state.recipes.map((r) => [r.id, r]));
  for (const item of Object.values(read("edits", {})))
    recipes.set(item.id, normalizeRecipe(item));
  state.recipes = [...recipes.values()];
}
function editRecipe(original) {
  const draft = original
    ? structuredClone(original)
    : normalizeRecipe({ id: createId(), title: "", type: "General" });
  let selected = 0,
    dirty = false;
  const close = () => {
    if (!dirty || confirm("¿Descartar los cambios sin guardar?")) sheet.close();
  };
  sheet.oncancel = (e) => {
    e.preventDefault();
    close();
  };
  const unload = (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", unload);
  sheet.onclose = () => {
    window.removeEventListener("beforeunload", unload);
    sheet.oncancel = null;
    sheet.onclose = null;
  };
  function field(target, key, label, kind = "text") {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;
    const input = document.createElement(
      ["lines", "long", "tags"].includes(kind) ? "textarea" : "input",
    );
    if (input.tagName === "INPUT") input.type = kind;
    if (kind === "number") {
      input.min = "1";
      input.step = "1";
    }
    input.value = Array.isArray(target[key])
      ? target[key].join(kind === "tags" ? ", " : "\n")
      : (target[key] ?? "");
    input.oninput = () => {
      dirty = true;
      target[key] =
        kind === "lines" || kind === "tags"
          ? input.value
              .split(kind === "tags" ? "," : "\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : kind === "number"
            ? Number(input.value) || null
            : input.value;
      if (key === "image")
        target.images = [input.value, ...(target.images || []).slice(1)].filter(
          Boolean,
        );
    };
    wrapper.append(input);
    return wrapper;
  }
  function rows(detail, key, title) {
    const group = document.createElement("details");
    group.open = true;
    const heading = document.createElement("summary");
    heading.textContent = title;
    group.append(heading);
    function action(label, run) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.onclick = () => {
        dirty = true;
        run();
        show();
      };
      return b;
    }
    const list = detail[key];
    const meta = (detail.stepDetails ||= []);
    list.forEach((value, i) => {
      const row = document.createElement("fieldset");
      const input = document.createElement("textarea");
      input.setAttribute("aria-label", title + " " + (i + 1));
      input.value = value;
      input.oninput = () => {
        list[i] = input.value;
        dirty = true;
      };
      row.append(input);
      if (key === "steps") {
        const extra = (meta[i] ||= {});
        row.append(
          field(extra, "minutes", "Temporizador (min)", "number"),
          field(extra, "image", "Foto del paso (URL o ruta)"),
        );
      }
      const controls = document.createElement("div");
      controls.className = "actions";
      function move(to) {
        [list[i], list[to]] = [list[to], list[i]];
        if (key === "steps") [meta[i], meta[to]] = [meta[to], meta[i]];
      }
      if (i) controls.append(action("Subir", () => move(i - 1)));
      if (i + 1 < list.length)
        controls.append(action("Bajar", () => move(i + 1)));
      controls.append(
        action("Quitar", () => {
          list.splice(i, 1);
          if (key === "steps") meta.splice(i, 1);
        }),
      );
      row.append(controls);
      group.append(row);
    });
    group.append(
      action(key === "steps" ? "Añadir paso" : "Añadir ingrediente", () =>
        list.push(""),
      ),
    );
    if (key === "ingredients")
      group.append(action("Añadir grupo", () => list.push("Grupo: ")));
    return group;
  }
  function show() {
    const variant = draft.variants[selected],
      detail = variant || draft;
    sheet.innerHTML =
      "<h2>" +
      (original ? "Editar receta" : "Nueva receta") +
      '</h2><form><fieldset id="general"><legend>Receta</legend></fieldset><fieldset id="versions"><legend>Variantes</legend></fieldset><fieldset id="preparation"><legend>Preparación</legend></fieldset><p>Los cambios se guardan en este navegador.</p><div class="actions"><button class="primary">Guardar receta</button>' +
      button("Cancelar", "close") +
      "</div></form>";
    $("#general").append(
      field(draft, "title", "Título"),
      field(draft, "notes", "Descripción", "long"),
      field(draft, "type", "Categoría"),
      field(draft, "profile", "Sabor"),
      field(draft, "tags", "Etiquetas separadas por comas", "tags"),
      field(draft, "image", "Imagen (URL o ruta)"),
    );
    $("#general input").required = true;
    const versions = $("#versions");
    draft.variants.forEach((v, i) =>
      versions.insertAdjacentHTML(
        "beforeend",
        '<button type="button" data-act="select:' +
          i +
          '" aria-pressed="' +
          (i === selected) +
          '">' +
          html(v.label) +
          (i === 0 ? " · Predeterminada" : "") +
          "</button>",
      ),
    );
    versions.insertAdjacentHTML(
      "beforeend",
      button("Añadir variante", "add") +
        (variant
          ? button("Duplicar", "duplicate") +
            button("Eliminar variante", "delete") +
            (selected
              ? button("Subir", "up") +
                button("Hacer predeterminada", "default")
              : "") +
            (selected < draft.variants.length - 1
              ? button("Bajar", "down")
              : "")
          : ""),
    );
    const prep = $("#preparation");
    if (variant)
      prep.append(
        field(variant, "label", "Nombre o nivel"),
        field(variant, "title", "Título de la variante"),
        field(variant, "summary", "Introducción", "long"),
        field(
          variant,
          "learns",
          "Qué aprenderás (una línea por punto)",
          "lines",
        ),
      );
    prep.append(field(detail, "prepTime", "Tiempo en minutos", "number"));
    const difficulty = document.createElement("label");
    difficulty.textContent = "Dificultad";
    const select = document.createElement("select");
    for (const value of ["baja", "media", "alta"])
      select.add(new Option(formatDifficulty(value), value));
    select.value = detail.difficulty;
    select.onchange = () => {
      dirty = true;
      detail.difficulty = select.value;
    };
    difficulty.append(select);
    prep.append(
      difficulty,
      field(detail, "yields", "Raciones o cantidad obtenida"),
    );
    const timing = document.createElement("details");
    timing.innerHTML = "<summary>Desglose de tiempos</summary>";
    for (const name of [
      "Preparación activa",
      "Reposo",
      "Fermentación",
      "Cocción",
    ])
      timing.append(
        field((detail.times ||= {}), name, name + " (min)", "number"),
      );
    prep.append(
      timing,
      rows(detail, "ingredients", "Ingredientes"),
      rows(detail, "steps", "Pasos"),
    );
    sheet.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      if (!draft.title.trim()) {
        alert("Introduce un título.");
        return;
      }
      if (draft.variants.some((v) => !v.label.trim())) {
        alert("Cada variante necesita un nombre.");
        return;
      }
      if (
        [draft, ...draft.variants].some((v) =>
          [...v.ingredients, ...v.steps].some(
            (line) => !line.trim() || line.trim() === "Grupo:",
          ),
        )
      ) {
        alert("Completa o quita las filas vacías.");
        return;
      }
      draft.updatedAt = new Date().toISOString();
      const edits = read("edits", {});
      edits[draft.id] = draft;
      save("edits", edits);
      loadEdits();
      renderTypeFilter();
      el.typeFilter.value = state.filters.type;
      renderRecipes();
      dirty = false;
      sheet.close();
      const link = recipeLink(draft.id, draft.variants[selected]?.id);
      if (location.hash === link) route();
      else location.hash = link;
    };
    sheet.querySelectorAll("[data-act]").forEach(
      (b) =>
        (b.onclick = () => {
          const [action, arg] = b.dataset.act.split(":");
          if (action === "close") {
            close();
            return;
          }
          if (action === "select") {
            selected = Number(arg);
            show();
            return;
          }
          if (
            action === "delete" &&
            !confirm("¿Eliminar esta variante del borrador?")
          )
            return;
          dirty = true;
          if (action === "add" || action === "duplicate") {
            const base =
              action === "duplicate"
                ? structuredClone(variant)
                : normalizeVariant({
                    ingredients: [...draft.ingredients],
                    steps: [...draft.steps],
                    difficulty: draft.difficulty,
                    prepTime: draft.prepTime,
                  });
            base.id = createId();
            base.label =
              action === "duplicate"
                ? base.label + " (copia)"
                : "Nueva variante";
            draft.variants.push(base);
            selected = draft.variants.length - 1;
          } else if (action === "delete") {
            draft.variants.splice(selected, 1);
            selected = Math.max(0, selected - 1);
          } else {
            const next =
              action === "default" ? 0 : selected + (action === "up" ? -1 : 1);
            draft.variants.splice(selected, 1);
            draft.variants.splice(next, 0, variant);
            selected = next;
          }
          show();
        }),
    );
  }
  show();
  sheet.showModal();
}
$("#newRecipe").onclick = () => editRecipe();
function addShopping() {
  const basket = read("basket", []);
  for (const line of ingredients().filter(
    (line) => !line.startsWith("Grupo: "),
  )) {
    const m = measurement(line);
    const same =
      m &&
      basket.find(
        (row) => !row.checked && row.unit === m.unit && row.name === m.name,
      );
    if (same) same.amount += m.amount;
    else basket.push(m || { name: line });
  }
  save("basket", basket);
  showShopping();
}
function showShopping() {
  const basket = read("basket", []);
  const line = (row) =>
    row.unit ? decimal(row.amount) + " " + row.unit + " " + row.name : row.name;
  sheet.innerHTML =
    "<h2>Lista de la compra</h2>" +
    (basket.length
      ? basket
          .map(
            (row, i) =>
              '<div class="actions"><label class="check"><input type="checkbox" data-row="' +
              i +
              '" ' +
              (row.checked ? "checked" : "") +
              "><span>" +
              html(line(row)) +
              "</span></label>" +
              button("Eliminar", "remove:" + i) +
              "</div>",
          )
          .join("") + button("Copiar lista", "copy")
      : "<p>Añade los ingredientes desde la variante que quieras cocinar.</p>") +
    " " +
    button("Cerrar", "close");
  sheet.querySelectorAll("[data-row]").forEach(
    (input) =>
      (input.onchange = () => {
        basket[input.dataset.row].checked = input.checked;
        save("basket", basket);
      }),
  );
  sheet.querySelectorAll("[data-act]").forEach(
    (b) =>
      (b.onclick = async () => {
        const [action, i] = b.dataset.act.split(":");
        if (action === "close") sheet.close();
        if (action === "remove") {
          basket.splice(Number(i), 1);
          save("basket", basket);
          showShopping();
        }
        if (action === "copy") {
          try {
            await navigator.clipboard.writeText(basket.map(line).join("\n"));
            b.textContent = "Copiado";
          } catch {
            alert("El navegador no permite copiar la lista.");
          }
        }
      }),
  );
  if (!sheet.open) sheet.showModal();
}
$("#shopping").onclick = showShopping;
