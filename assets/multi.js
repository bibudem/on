/* jshint esversion: 6 */

let $select = $(".multi-select");

$select.on("change-files", (e, files) => {
  $(".multi-files-value").val(JSON.stringify(files.map((f) => f.name)));
  if (files.length == 0) {
    $(".multi-files").html(
      `<li class="list-group-item text-muted">Aucun fichier sélectionné</li>`
    );
    return;
  }
  $(".multi-files").html(
    files
      .map((f) => {
        const badge = `<span class="badge rounded-pill bg-secondary badge-alignment">
          ${filesize(f.size, {locale: "fr", separator: ',', symbols: {GB: 'Go', MB: 'Mo', kB: 'Ko', B: 'o'}})}
        </span>`;
        return `
          <li class="list-group-item d-flex align-items-start justify-content-between">
            <span class="name">${htmlEscape(f.name)}</span>
            ${f.type == "directory" ? `` : badge}
          </li>
        `;
      })
      .join("")
  );
  const hasDirectory = files.reduce(
    (a, f) => a || f.type == "directory",
    false
  );
  const totalSize = files.map((f) => f.size).reduce((a, b) => parseInt(a) + parseInt(b));
  if (hasDirectory) {
    $(".multi-files-total").val("");
  } else {
    $(".multi-files-total").val(filesize(totalSize, {locale: "fr", separator: ',', symbols: {GB: 'Go', MB: 'Mo', kB: 'Ko', B: 'o'}}));
  }
});

const updateSelected = () => {
  let $selected = $(".multi-select:checked");
  let files = [];
  $selected.each((i, ele) => {
    files.push({
      name: $(ele).data("select"),
      type: $(ele).data("select-type"),
      size: String($(ele).data("select-size")).replace(',',''),
    });
  });
  $select.trigger("change-files", [files]);
};

$select.on("change", updateSelected);
updateSelected();
