// test_import_csv.js — Tests for CSV import
// Run with: node test_import_csv.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var confirmCalled = false;
var confirmAnswer = true;

global.addBotMessage = function(text) { lastBotMessage = text; };
global.addUserMessage = function() {};
global.setChips = function() {};
global.setBoxOpenChips = function() {};
global.renderSidebar = function() {};
global.updateContextBar = function() {};
global.showTyping = function() {};
global.hideTyping = function() {};
global.saveState = function() {};
global.chipClick = function() {};
global.escHtml = function(s) { return String(s||''); };
global.renderMarkdown = function(s) { return s; };
global.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };
global.dlBlob = function() {};  // stub — overridden per-test where needed
global.document = { createElement: function() { return { click: function(){}, href:'', download:'' }; }, getElementById: function() { return null; } };
global.URL = { createObjectURL: function() { return ''; }, revokeObjectURL: function() {} };
global.Blob = function(parts) { global._lastCSV = parts[0]; };  // default capture
global.confirm = function() { confirmCalled = true; return confirmAnswer; };

var app = require('../app.js');
var state = app.state;
var uid = app.uid;
var parseCSV = app.parseCSV;
var parseCSVLine = app.parseCSVLine;
var importCSV = app.importCSV;
var exportCSV = app.exportCSV;
var FATES = app.FATES;

// ── HARNESS ───────────────────────────────────────────────────────────────────
var passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  ✅ ' + desc); passed++; }
  else           { console.error('  ❌ ' + desc); failed++; }
}

function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;
  state.storageFull = false;
  state.conversationStage = 'BOX_OPEN';
  lastBotMessage = null;
  confirmCalled = false;
  confirmAnswer = true;
}

// ── TESTS ──────────────────────────────────────────────────────────────────────

console.log('\nCSV Import Tests\n');

console.log('1. parseCSVLine: simple line');
var line = parseCSVLine('kitchen,Kitchen,Bowl,keep,chipped');
assert('splits correctly', JSON.stringify(line) === JSON.stringify(['kitchen', 'Kitchen', 'Bowl', 'keep', 'chipped']));

console.log('\n2. parseCSVLine: quoted field with comma');
line = parseCSVLine('kitchen,Kitchen,"Bowl, ceramic",keep,notes');
assert('handles comma in quotes', JSON.stringify(line) === JSON.stringify(['kitchen', 'Kitchen', 'Bowl, ceramic', 'keep', 'notes']));

console.log('\n3. parseCSVLine: escaped quotes');
line = parseCSVLine('kitchen,Kitchen,Bowl,keep,"says ""fragile"""');
assert('handles escaped quotes', line[4] === 'says "fragile"');

console.log('\n4. parseCSV: validates header');
reset();
var csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,';
var rows = parseCSV(csv);
assert('valid header accepted', rows !== null && rows.length === 1);

console.log('\n5. parseCSV: rejects invalid header');
reset();
csv = 'location,box,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,';
rows = parseCSV(csv);
assert('invalid header rejected', rows === null);
assert('error message shown', lastBotMessage.includes('expected columns'));

console.log('\n6. parseCSV: skips empty lines');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,\n\nkitchen,Kitchen,Plate,donate,';
rows = parseCSV(csv);
assert('empty lines skipped', rows.length === 2);

console.log('\n7. parseCSV: rejects malformed rows');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl';
rows = parseCSV(csv);
assert('malformed row rejected', rows === null);
assert('error on line 2', lastBotMessage.includes('line 2'));

console.log('\n8. importCSV: empty inventory prompts for confirmation');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,';
importCSV(csv);
assert('no confirm needed for empty state', confirmCalled === false);
assert('import proceeds', state.boxes.length === 1);

console.log('\n9. importCSV: existing data is merged, not replaced');
reset();
state.boxes.push({ id: 'old', name: 'Old box', location: '', notes: '', parentId: null, createdAt: '', items: [] });
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,';
importCSV(csv);
assert('no confirm needed', confirmCalled === false);
assert('old box preserved', state.boxes.some(function(b) { return b.name === 'Old box'; }));
assert('new box added', state.boxes.some(function(b) { return b.name === 'Kitchen'; }));
assert('total 2 boxes', state.boxes.length === 2);

console.log('\n10. importCSV: items merged into existing matching box');
reset();
state.boxes.push({ id: 'existing', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '', items: [
  { id: 'i1', name: 'Mug', fate: 'keep', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' }
] });
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,';
importCSV(csv);
assert('still 1 box (merged)', state.boxes.length === 1);
assert('original item kept', state.boxes[0].items.some(function(i) { return i.name === 'Mug'; }));
assert('new item added', state.boxes[0].items.some(function(i) { return i.name === 'Bowl'; }));
assert('2 items total', state.boxes[0].items.length === 2);

console.log('\n11. importCSV: single item');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,chipped';
importCSV(csv);
assert('1 box created', state.boxes.length === 1);
assert('box name', state.boxes[0].name === 'Kitchen');
assert('box location', state.boxes[0].location === 'kitchen');
assert('1 item in box', state.boxes[0].items.length === 1);
assert('item name', state.boxes[0].items[0].name === 'Bowl');
assert('item fate', state.boxes[0].items[0].fate === 'keep');
assert('item notes', state.boxes[0].items[0].notes === 'chipped');
assert('item has deleted_at', state.boxes[0].items[0].deleted_at === null);

console.log('\n12. importCSV: multiple items same box');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,\nkitchen,Kitchen,Plate,donate,';
importCSV(csv);
assert('1 box', state.boxes.length === 1);
assert('2 items', state.boxes[0].items.length === 2);
assert('items grouped', state.boxes[0].items[0].name === 'Bowl' && state.boxes[0].items[1].name === 'Plate');

console.log('\n13. importCSV: multiple boxes different locations');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,\nbedroom,Bedroom,Lamp,unsure,needs bulb';
importCSV(csv);
assert('2 boxes', state.boxes.length === 2);
assert('kitchen box', state.boxes[0].location === 'kitchen' && state.boxes[0].name === 'Kitchen');
assert('bedroom box', state.boxes[1].location === 'bedroom' && state.boxes[1].name === 'Bedroom');

console.log('\n14. importCSV: same name different location creates separate boxes');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Storage,Box1,keep,\nbedroom,Storage,Box2,unsure,';
importCSV(csv);
assert('2 boxes created', state.boxes.length === 2);
assert('box 1 location', state.boxes[0].location === 'kitchen');
assert('box 2 location', state.boxes[1].location === 'bedroom');

console.log('\n15. importCSV: invalid fate defaults to unsure');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,invalid,\nkitchen,Kitchen,Plate,keep,';
importCSV(csv);
assert('item 1 fate unsure', state.boxes[0].items[0].fate === 'unsure');
assert('item 2 fate keep', state.boxes[0].items[1].fate === 'keep');

console.log('\n16. importCSV: empty location allowed');
reset();
csv = 'location,box name,item name,fate,notes\n,Kitchen,Bowl,keep,';
importCSV(csv);
assert('box with empty location', state.boxes[0].location === '');

console.log('\n17. importCSV: multiple items duplicate rows');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,\nkitchen,Kitchen,Bowl,keep,';
importCSV(csv);
assert('2 items created', state.boxes[0].items.length === 2);
assert('both are Bowl', state.boxes[0].items[0].name === 'Bowl' && state.boxes[0].items[1].name === 'Bowl');

console.log('\n18. importCSV: round-trip fidelity');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,chipped\nbedroom,Bedroom,Lamp,unsure,needs bulb';
importCSV(csv);
var exported = state.boxes.reduce(function(acc, box) {
  return acc.concat(box.items.map(function(item) {
    return box.location + ',' + box.name + ',' + item.name + ',' + item.fate + ',' + (item.notes || '');
  }));
}, []);
assert('round-trip matches', exported.length === 2 && 
  exported[0] === 'kitchen,Kitchen,Bowl,keep,chipped' &&
  exported[1] === 'bedroom,Bedroom,Lamp,unsure,needs bulb');

console.log('\n19. importCSV: summary message');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,\nkitchen,Kitchen,Plate,donate,\nbedroom,Bedroom,Lamp,unsure,';
importCSV(csv);
assert('summary shows new boxes', lastBotMessage.includes('2 new box'));
assert('summary shows new items', lastBotMessage.includes('3 new item'));

console.log('\n20. importCSV: all FATES values preserved');
reset();
csv = 'location,box name,item name,fate,notes\n' +
  'k,K,keep,keep,\n' +
  'k,K,donate,donate,\n' +
  'k,K,sell,sell,\n' +
  'k,K,unsure,unsure,\n' +
  'k,K,trash,trash,';
importCSV(csv);
assert('all fates present', 
  state.boxes[0].items[0].fate === 'keep' &&
  state.boxes[0].items[1].fate === 'donate' &&
  state.boxes[0].items[2].fate === 'sell' &&
  state.boxes[0].items[3].fate === 'unsure' &&
  state.boxes[0].items[4].fate === 'trash');

console.log('\n21. importCSV: duplicate items are skipped on merge');
reset();
state.boxes.push({ id: 'b1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '', items: [
  { id: 'i1', name: 'Bowl', fate: 'keep', notes: 'chipped', deleted_at: null, description: '', photos: [], createdAt: '' }
] });
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,chipped';
importCSV(csv);
assert('duplicate skipped, still 1 item', state.boxes[0].items.length === 1);
assert('no-new-items message', lastBotMessage.includes('No new items'));

console.log('\n22. importCSV: phone-to-computer sync scenario');
reset();
// Computer has Kitchen with Mug; phone added Bowl to same box + new Bedroom box
state.boxes.push({ id: 'b1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '', items: [
  { id: 'i1', name: 'Mug', fate: 'keep', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' }
] });
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Mug,keep,\nkitchen,Kitchen,Bowl,donate,\nbedroom,Bedroom,Lamp,unsure,needs bulb';
importCSV(csv);
assert('2 boxes total', state.boxes.length === 2);
assert('Kitchen has 2 items (Mug deduped, Bowl added)', state.boxes[0].items.length === 2);
assert('Bowl added', state.boxes[0].items.some(function(i) { return i.name === 'Bowl'; }));
assert('Mug still present', state.boxes[0].items.some(function(i) { return i.name === 'Mug'; }));
assert('Bedroom created', state.boxes[1].name === 'Bedroom');
assert('summary: 1 new box', lastBotMessage.includes('1 new box'));
assert('summary: 2 new items', lastBotMessage.includes('2 new item'));


console.log('\n23. parseCSV: accepts 7-column header with ids');
reset();
csv = 'location,box name,item name,fate,notes,box id,item id\nkitchen,Kitchen,Bowl,keep,chipped,b1,i1';
rows = parseCSV(csv);
assert('7-col header accepted', rows !== null && rows.length === 1);
assert('boxId parsed', rows[0].boxId === 'b1');
assert('itemId parsed', rows[0].itemId === 'i1');

console.log('\n24. parseCSV: legacy 5-column CSV still accepted');
reset();
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,';
rows = parseCSV(csv);
assert('legacy header accepted', rows !== null);
assert('boxId empty string', rows[0].boxId === '');
assert('itemId empty string', rows[0].itemId === '');

console.log('\n25. exportCSV: includes box id and item id columns');
reset();
state.boxes = [{
  id: 'box1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '',
  items: [{ id: 'itm1', name: 'Bowl', fate: 'keep', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' }]
}];
global._lastCSV = '';
exportCSV();
var exportLines = global._lastCSV.split('\n');
assert('header has 7 columns', exportLines[0] === 'location,box name,item name,fate,notes,box id,item id');
assert('data row has box id', exportLines[1].includes('box1'));
assert('data row has item id', exportLines[1].includes('itm1'));

console.log('\n26. importCSV: item id dedup — same id skipped silently');
reset();
state.boxes.push({ id: 'b1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '', items: [
  { id: 'i1', name: 'Bowl', fate: 'keep', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' }
] });
csv = 'location,box name,item name,fate,notes,box id,item id\nkitchen,Kitchen,Bowl,keep,,b1,i1';
importCSV(csv);
assert('id-matched item skipped', state.boxes[0].items.length === 1);
assert('no near-dup warning', !lastBotMessage.includes('⚠'));

console.log('\n27. importCSV: box id dedup — same box id, new item added correctly');
reset();
state.boxes.push({ id: 'b1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '', items: [
  { id: 'i1', name: 'Mug', fate: 'keep', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' }
] });
csv = 'location,box name,item name,fate,notes,box id,item id\nkitchen,Kitchen,Bowl,keep,,b1,i2';
importCSV(csv);
assert('matched by box id, merged', state.boxes.length === 1);
assert('new item added', state.boxes[0].items.length === 2);
assert('new item has correct id', state.boxes[0].items.some(function(i) { return i.id === 'i2'; }));

console.log('\n28. importCSV: near-dup item warning — same name/fate/notes, no id match');
reset();
state.boxes.push({ id: 'b1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '', items: [
  { id: 'i1', name: 'Bowl', fate: 'keep', notes: 'chipped', deleted_at: null, description: '', photos: [], createdAt: '' }
] });
// Incoming has no item id, so can't confirm identity — should warn
csv = 'location,box name,item name,fate,notes,box id,item id\nkitchen,Kitchen,Bowl,keep,chipped,b1,';
importCSV(csv);
assert('item not added (near-dup)', state.boxes[0].items.length === 1);
assert('near-dup warning shown', lastBotMessage.includes('\u26a0'));
assert('near-dup warning mentions item name', lastBotMessage.includes('Bowl'));

console.log('\n29. importCSV: IDs retained on new items');
reset();
csv = 'location,box name,item name,fate,notes,box id,item id\nkitchen,Kitchen,Bowl,keep,,newbox1,newitem1';
importCSV(csv);
assert('box id retained', state.boxes[0].id === 'newbox1');
assert('item id retained', state.boxes[0].items[0].id === 'newitem1');

console.log('\n30. importCSV: missing ids get generated');
reset();
csv = 'location,box name,item name,fate,notes,box id,item id\nkitchen,Kitchen,Bowl,keep,,, ';
importCSV(csv);
assert('box gets generated id', state.boxes[0].id.length > 0);
assert('item gets generated id', state.boxes[0].items[0].id.length > 0);

// ── SUMMARY ────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log('✅ ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
