const sheet = $("#sheet");
function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + "\n"], {type: "application/json"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

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
  const body = $("#basketBody");
  body.innerHTML =
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
      : "<p>Añade los ingredientes desde la variante que quieras cocinar.</p>");
  body.querySelectorAll("[data-row]").forEach(
    (input) =>
      (input.onchange = () => {
        basket[input.dataset.row].checked = input.checked;
        commitBasket();
      }),
  );
  body.querySelectorAll("[data-act]").forEach(
    (b) =>
      (b.onclick = async () => {
        const [action, i] = b.dataset.act.split(":");
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
