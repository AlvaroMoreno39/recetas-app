const sheet = $("#sheet");
function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + "\n"], {type: "application/json"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function editRecipe(original) {
  const draft = original ? structuredClone(original) :
    normalizeRecipe({ id: createId(), title: "", type: "General" });
  sheet.setAttribute("aria-label", original ? "Editar receta" : "Nueva receta");
  let selected = Math.max(0, draft.variants.findIndex(v => v.id === active?.variant?.id)),
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
      '</h2><form><fieldset id="general"><legend>Receta</legend></fieldset><fieldset id="versions"><legend>Variantes</legend></fieldset><fieldset id="preparation"><legend>Preparación</legend></fieldset><p>Descarga esta receta y añádela al catálogo del repositorio para publicarla.</p><div class="actions"><button class="primary">Descargar receta JSON</button>' +
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
      downloadJson(draft, draft.id + ".json");
      dirty = false;

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
  if (save("basket", basket)) showShopping();
}
function showShopping() {
  const basket = read("basket", []);
  let revision = JSON.stringify(basket);
  function commitBasket() {
    if (JSON.stringify(read("basket", [])) !== revision) {
      alert("La compra ha cambiado en otra pestaña. Revisa la lista actualizada.");
      showShopping();
      return false;
    }
    if (!save("basket", basket)) { showShopping(); return false; }
    revision = JSON.stringify(basket);
    return true;
  }
  const line = (row) =>
    row.unit ? decimal(row.amount) + " " + row.unit + " " + row.name : row.name;
  sheet.setAttribute("aria-label", "Lista de la compra");
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
        commitBasket();
      }),
  );
  sheet.querySelectorAll("[data-act]").forEach(
    (b) =>
      (b.onclick = async () => {
        const [action, i] = b.dataset.act.split(":");
        if (action === "close") sheet.close();
        if (action === "remove") {
          basket.splice(Number(i), 1);
          if (commitBasket()) showShopping();
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

// Preserve the original strings, even if an older entry cannot be parsed.
$("#backup").onclick = () => {
  try {
    const entries = Object.fromEntries(Object.keys(localStorage)
      .filter(key => key.startsWith("recetario:"))
      .map(key => [key, localStorage.getItem(key)]));
    const snapshot = {format: "mis-recetas", version: 1, createdAt: new Date().toISOString(), entries};
    downloadJson(snapshot, "mis-recetas-" + snapshot.createdAt.replaceAll(":", "-") + ".json");
  } catch { alert("No se ha podido exportar el almacenamiento de este navegador."); }
};

const legacyDrafts = Object.values(read("edits", {})).filter(recipe =>
  recipe && typeof recipe.id === "string" && typeof recipe.title === "string");
for (const recipe of legacyDrafts) {
  const control = document.createElement("button");
  control.textContent = recipe.title;
  control.onclick = () => editRecipe(normalizeRecipe(recipe));
  $("#legacy div").append(control);
}
$("#legacy").hidden = !legacyDrafts.length;
