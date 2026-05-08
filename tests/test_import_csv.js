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
global.confirm = function() { confirmCalled = true; return confirmAnswer; };

var app = require('../app.js');
var state = app.state;
var uid = app.uid;
var parseCSV = app.parseCSV;
var parseCSVLine = app.parseCSVLine;
var importCSV = app.importCSV;
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

console.log('\n9. importCSV: existing data prompts for confirmation');
reset();
state.boxes.push({ id: 'old', name: 'Old box', location: '', notes: '', parentId: null, createdAt: '', items: [] });
confirmCalled = false;
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,';
importCSV(csv);
assert('confirm called', confirmCalled === true);
assert('old data cleared on confirm', state.boxes[0].name === 'Kitchen');

console.log('\n10. importCSV: existing data not imported on cancel');
reset();
var oldBox = { id: 'old', name: 'Old box', location: '', notes: '', parentId: null, createdAt: '', items: [] };
state.boxes.push(oldBox);
confirmAnswer = false;
confirmCalled = false;
csv = 'location,box name,item name,fate,notes\nkitchen,Kitchen,Bowl,keep,';
importCSV(csv);
assert('import cancelled', state.boxes.length === 1 && state.boxes[0].name === 'Old box');

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
assert('summary shows boxes', lastBotMessage.includes('2 box'));
assert('summary shows items', lastBotMessage.includes('3 item'));

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

// ── SUMMARY ────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log('✅ ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
