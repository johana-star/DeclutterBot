// test_import.js — Tests for Import JSON feature
// Run with: node test_import.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var lastChips = [];
var confirmResponse = true; // control confirm() behaviour

global.addBotMessage    = function(text) { lastBotMessage = text; };
global.addUserMessage   = function() {};
global.setChips         = function(chips) { lastChips = chips; };
global.renderSidebar    = function() {};
global.updateContextBar = function() {};
global.showTyping       = function() {};
global.hideTyping       = function() {};
global.saveState        = function() {};
global.chipClick        = function() {};
global.escHtml          = function(s) { return String(s||''); };
global.renderMarkdown   = function(s) { return s; };
global.localStorage     = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };
global.confirm          = function() { return confirmResponse; };
global.document = {
  getElementById: function() { return { innerHTML: '', value: '', style: {}, scrollTop: 0 }; },
  createElement:  function() { return { className: '', innerHTML: '', appendChild: function(){}, style: {}, href: '', download: '', click: function(){} }; }
};
global.URL = { createObjectURL: function() { return ''; }, revokeObjectURL: function() {} };

var app        = require('../app.js');
var helpers    = app.helpers;
var state      = app.state;
var uid        = app.uid;
var importJSON = app.importJSON;

// ── HARNESS ───────────────────────────────────────────────────────────────────
var passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}
function assertIncludes(desc, haystack, needle) {
  assert(desc, haystack && haystack.indexOf(needle) !== -1);
}
function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;
  state.pendingBatch = null;
  state.pendingBoxBatch = null;
  state.pendingDeleteBoxId = null;
  state.pendingNest = null;
  state.activeItemViewGroup = null;
  state.conversationStage = 'BOX_OPEN';
  lastBotMessage = null;
  lastChips = [];
  confirmResponse = true;
}

function makeValidExport(boxes) {
  return {
    exportedAt: new Date().toISOString(),
    boxes: boxes || []
  };
}

console.log('\nImport JSON Tests\n');

// 1. Valid import replaces state
console.log('1. Valid import loads boxes into state');
reset();
var data = makeValidExport([
  { id: 'b1', name: 'Garage Box', location: 'garage', parentId: null, notes: '', createdAt: new Date().toISOString(),
    items: [{ id: 'i1', name: 'Lamp', fate: 'keep', notes: '', description: '', createdAt: new Date().toISOString() }] }
]);
importJSON(data);
assert('box loaded', state.boxes.length === 1);
assert('box name correct', state.boxes[0].name === 'Garage Box');
assert('item loaded', state.boxes[0].items.length === 1);
assert('item name correct', state.boxes[0].items[0].name === 'Lamp');

// 2. Import confirms count in bot message
console.log('\n2. Import shows box and item count in confirmation');
reset();
var data2 = makeValidExport([
  { id: 'b1', name: 'Box A', location: '', parentId: null, notes: '', createdAt: '', items: [
    { id: 'i1', name: 'Chair', fate: 'donate', notes: '', description: '', createdAt: '' }
  ]},
  { id: 'b2', name: 'Box B', location: '', parentId: null, notes: '', createdAt: '', items: [] }
]);
importJSON(data2);
assertIncludes('shows box count', lastBotMessage, '2');
assertIncludes('shows item count', lastBotMessage, '1');

// 3. Import clears activeBoxId and resets stage
console.log('\n3. Import clears active box and resets to FINISHED');
reset();
state.activeBoxId = 'old-box';
importJSON(makeValidExport([
  { id: 'b1', name: 'New Box', location: '', parentId: null, notes: '', createdAt: '', items: [] }
]));
assert('activeBoxId cleared', state.activeBoxId === null);
assert('stage set to FINISHED', state.conversationStage === 'FINISHED');

// 4. Import offers action chips
console.log('\n4. Import offers action chips after loading');
reset();
importJSON(makeValidExport([]));
assert('Review all boxes chip', lastChips.indexOf('Review all boxes') !== -1);
assert('New box chip', lastChips.indexOf('New box') !== -1);

// 5. Invalid JSON structure shows error
console.log('\n5. Missing boxes array shows error');
reset();
importJSON({ exportedAt: new Date().toISOString() }); // no boxes key
assertIncludes('shows error', lastBotMessage, 'does not look like');
assert('state unchanged', state.boxes.length === 0);

// 6. Null data shows error
console.log('\n6. Null data shows error');
reset();
importJSON(null);
assertIncludes('shows error for null', lastBotMessage, 'does not look like');

// 7. Boxes array but no items array — items defaults to empty
console.log('\n7. Box without items array gets empty items array');
reset();
importJSON({ boxes: [
  { id: 'b1', name: 'Box', location: '', parentId: null, notes: '', createdAt: '' }
  // no items field
]});
assert('items defaults to array', Array.isArray(state.boxes[0].items));
assert('items is empty', state.boxes[0].items.length === 0);

// 8. Items without notes/fate get defaults
console.log('\n8. Items missing optional fields get safe defaults');
reset();
importJSON({ boxes: [
  { id: 'b1', name: 'Box', location: '', parentId: null, notes: '', createdAt: '',
    items: [{ id: 'i1', name: 'Thing', createdAt: '' }] } // no fate, no notes
]});
assert('fate defaults to unsure', state.boxes[0].items[0].fate === 'unsure');
assert('notes defaults to empty string', state.boxes[0].items[0].notes === '');

// 9. parentId undefined normalised to null
console.log('\n9. Box with undefined parentId is normalised to null');
reset();
var box9 = { id: 'b1', name: 'Legacy Box', location: '', notes: '', createdAt: '', items: [] };
// parentId intentionally absent
importJSON({ boxes: [box9] });
assert('parentId normalised to null', state.boxes[0].parentId === null);

// 10. Existing data with different name/location — both kept (merge, not replace)
console.log('\n10. Import merges new box into existing inventory');
reset();
state.boxes.push({ id: 'existing', name: 'Old Box', location: 'room a', parentId: null, notes: '', createdAt: '', items: [] });
importJSON(makeValidExport([
  { id: 'new-id', name: 'New Box', location: 'room b', parentId: null, notes: '', createdAt: '', items: [] }
]));
assert('existing data preserved', state.boxes.some(function(b) { return b.name === 'Old Box'; }));
assert('new box added', state.boxes.some(function(b) { return b.name === 'New Box'; }));

// 11. Existing data with same id — true duplicate, not duplicated
console.log('\n11. Import skips box with matching id (true duplicate)');
reset();
state.boxes.push({ id: 'same-id', name: 'My Box', location: 'room', parentId: null, notes: '', createdAt: '', items: [] });
importJSON(makeValidExport([
  { id: 'same-id', name: 'My Box', location: 'room', parentId: null, notes: '', createdAt: '', items: [] }
]));
assert('no duplicate box created', state.boxes.length === 1);
assert('original box preserved', state.boxes[0].name === 'My Box');

// 12. Empty state imports without confirm prompt
console.log('\n12. Import with empty state skips confirm');
reset();
confirmResponse = false; // would cancel if confirm was called
importJSON(makeValidExport([
  { id: 'b1', name: 'Box', location: '', parentId: null, notes: '', createdAt: '', items: [] }
]));
// If confirm was called with false response, boxes would be empty
assert('import proceeded without confirm', state.boxes.length === 1);

// 13. Nested boxes (parentId relationships) preserved on import
console.log('\n13. Nested box parentId relationships preserved');
reset();
importJSON({ boxes: [
  { id: 'parent', name: 'Desktop', location: 'bedroom', parentId: null, notes: '', createdAt: '', items: [] },
  { id: 'child',  name: 'Mac mini', location: 'bedroom', parentId: 'parent', notes: '', createdAt: '', items: [] }
]});
assert('parent box loaded', state.boxes.some(function(b){ return b.id === 'parent'; }));
assert('child parentId preserved', state.boxes.find(function(b){ return b.id === 'child'; }).parentId === 'parent');

// 14. exportedAt date shown in confirmation if present
console.log('\n14. exportedAt date shown in import confirmation');
reset();
importJSON({ exportedAt: '2026-01-15T10:00:00.000Z', boxes: [] });
assertIncludes('shows export date', lastBotMessage, '2026');

// 15. Import with no exportedAt still works
console.log('\n15. Import without exportedAt field works fine');
reset();
importJSON({ boxes: [] });
assert('import succeeded', state.conversationStage === 'FINISHED');
assert('no crash without exportedAt', lastBotMessage !== null);

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
