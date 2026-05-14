// ui.js — Browser UI glue for DeclutterBot
// Handles import/export button interactions and other browser-facing UI bindings.
// Depends on: app.js (importJSON, importCSV, exportJSON, exportCSV, addBotMessage)
// Load order: lodash.min.js → app.js → ui.js

var _importFormat = 'json'; // default

function setFormat(fmt) {
  _importFormat = fmt;
  document.getElementById('fmt-json').classList.toggle('fmt-active', fmt === 'json');
  document.getElementById('fmt-csv').classList.toggle('fmt-active',  fmt === 'csv');
}

function triggerImport() {
  var input = document.getElementById('import-file-input');
  input.accept = _importFormat === 'json' ? '.json' : '.csv';
  input.value = ''; // reset so same file can be re-imported
  input.click();
}

function handleImportFile(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    if (_importFormat === 'json') {
      var data;
      try { data = JSON.parse(e.target.result); }
      catch(err) { addBotMessage('Import failed \u2014 could not parse the file as JSON. Is it a valid inventory export?'); return; }
      importJSON(data);
    } else {
      importCSV(e.target.result);
    }
  };
  reader.readAsText(file);
}

function triggerExport() {
  if (_importFormat === 'json') exportJSON();
  else exportCSV();
}

function openNewTab(uri) {
  window.open(uri, '_blank');
}
