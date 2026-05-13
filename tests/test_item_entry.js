// test_item_entry.js — Tests for comma-separated item entry (parseItemEntry)
// Run with: node tests/test_item_entry.js

var lastBotMessage = null;
var lastChips = [];

global.addBotMessage = function(t) { lastBotMessage = t; };
global.addUserMessage = function() {};
global.setChips = function(c) { lastChips = c || []; };
global.setBoxOpenChips = function() { lastChips = []; };
global.renderSidebar = function() {};
global.updateContextBar = function() {};
global.showTyping = function() {};
global.hideTyping = function() {};
global.saveState = function() {};
global.chipClick = function() {};
global.escHtml = function(s) { return String(s || ''); };
global.renderMarkdown = function(s) { return s; };
global.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };
global.confirm = function() { return true; };
global.document = {
  getElementById: function() {
    return { innerHTML: '', style: {}, className: '', onclick: null,
             classList: { add: function() {}, remove: function() {} },
             appendChild: function() {}, scrollTop: 0, scrollHeight: 0 };
  },
  createElement: function() { return { className: '', innerHTML: '', appendChild: function() {} }; }
};

var app = require('../app.js');
var state = app.state;
var uid = app.uid;
var parseItemEntry = app.parseItemEntry;
var handleItemName = app.handleItemName;
var FATES = app.FATES;

app._setChipsImpl = function(chips) { lastChips = chips || []; };

var passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}

function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;
  state.conversationStage = 'AWAITING_ITEM_NAME';
  lastBotMessage = null;
  lastChips = [];
}

function makeBox(name) {
  var box = { id: uid(), name: name, location: 'room', notes: '', parentId: null, createdAt: '', items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}

function activeBox() { return state.boxes.find(function(b) { return b.id === state.activeBoxId; }); }

console.log('\nparseItemEntry tests\n');

console.log('1. Single part');
var r = parseItemEntry('bowl');
assert('name', r.name === 'bowl');
assert('fate null', r.fate === null);
assert('notes null', r.notes === null);

console.log('\n2. Two parts, fate recognized');
FATES.forEach(function(fate) {
  var r2 = parseItemEntry('bowl, ' + fate);
  assert(fate + ' recognized', r2.fate === fate && r2.notes === null);
});

console.log('\n3. Two parts, non-fate second');
var r3 = parseItemEntry('bowl, ceramic');
assert('fate unsure', r3.fate === 'unsure');
assert('notes ceramic', r3.notes === 'ceramic');
assert('warning shown', !!r3.warning);

console.log('\n4. Three parts: name, fate, notes');
var r4 = parseItemEntry('bowl, keep, chipped rim');
assert('name', r4.name === 'bowl');
assert('fate keep', r4.fate === 'keep');
assert('notes', r4.notes === 'chipped rim');

console.log('\n5. Four parts: name, fate, notes joined (commas in notes)');
var r5 = parseItemEntry('bowl, keep, chipped, hand-painted');
assert('name', r5.name === 'bowl');
assert('fate keep', r5.fate === 'keep');
assert('notes joined with comma', r5.notes === 'chipped, hand-painted');

console.log('\n6. Three parts: trailing comma gives empty notes');
var r6 = parseItemEntry('bowl, keep,');
assert('name', r6.name === 'bowl');
assert('fate keep', r6.fate === 'keep');
assert('notes empty string', r6.notes === '');

console.log('\n7. Five parts: name, fate, notes with multiple commas');
var r7 = parseItemEntry('bowl, donate, blue, ceramic, from grandma');
assert('name', r7.name === 'bowl');
assert('fate donate', r7.fate === 'donate');
assert('notes all joined', r7.notes === 'blue, ceramic, from grandma');

console.log('\n8. Unrecognized fate in position 2 -> unsure + warning');
var r8 = parseItemEntry('bowl, ceramic, some notes');
assert('name', r8.name === 'bowl');
assert('fate unsure (ceramic not a fate)', r8.fate === 'unsure');
assert('notes', r8.notes === 'some notes');
assert('warning mentions ceramic', r8.warning && r8.warning.includes('ceramic'));

console.log('\nhandleItemName integration\n');

console.log('9. Name only -> AWAITING_FATE');
reset(); makeBox('Kitchen');
handleItemName('bowl');
assert('stage AWAITING_FATE', state.conversationStage === 'AWAITING_FATE');
assert('item added', activeBox().items.length === 1);
assert('fate unsure', activeBox().items[0].fate === 'unsure');

console.log('\n10. Name + fate -> AWAITING_ITEM_NOTES');
reset(); makeBox('Kitchen');
handleItemName('bowl, keep');
assert('stage AWAITING_ITEM_NOTES', state.conversationStage === 'AWAITING_ITEM_NOTES');
assert('fate keep', activeBox().items[0].fate === 'keep');

console.log('\n11. Name + non-fate -> BOX_OPEN with warning');
reset(); makeBox('Kitchen');
handleItemName('bowl, ceramic');
assert('stage BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assert('fate unsure', activeBox().items[0].fate === 'unsure');
assert('notes ceramic', activeBox().items[0].notes === 'ceramic');
assert('warning in message', lastBotMessage.includes('ceramic'));

console.log('\n12. Name + fate + notes -> BOX_OPEN');
reset(); makeBox('Kitchen');
handleItemName('bowl, keep, chipped rim');
assert('stage BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assert('fate keep', activeBox().items[0].fate === 'keep');
assert('notes', activeBox().items[0].notes === 'chipped rim');

console.log('\n13. Notes with commas: name, fate, note1, note2 -> BOX_OPEN');
reset(); makeBox('Kitchen');
handleItemName('bowl, donate, hand-painted, from goodwill');
assert('stage BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assert('name bowl', activeBox().items[0].name === 'bowl');
assert('fate donate', activeBox().items[0].fate === 'donate');
assert('notes joined', activeBox().items[0].notes === 'hand-painted, from goodwill');

console.log('\n14. Trailing comma (empty notes) -> BOX_OPEN');
reset(); makeBox('Kitchen');
handleItemName('bowl, sell,');
assert('stage BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assert('name bowl', activeBox().items[0].name === 'bowl');
assert('fate sell', activeBox().items[0].fate === 'sell');
assert('notes empty', activeBox().items[0].notes === '');

console.log('\n15. All six fates as second part');
FATES.forEach(function(fate) {
  reset(); makeBox('Kitchen');
  handleItemName('widget, ' + fate);
  assert(fate + ' accepted', activeBox().items[0].fate === fate);
});


console.log('\n--- Semicolon mode ---');

console.log('\n16. Semicolon: name; fate -> AWAITING_ITEM_NOTES');
var r16 = parseItemEntry('bowl; keep');
assert('name', r16.name === 'bowl');
assert('fate keep', r16.fate === 'keep');
assert('notes null', r16.notes === null);
assert('no warning', !r16.warning);

console.log('\n17. Semicolon: name; fate; notes -> all set');
var r17 = parseItemEntry('bowl; keep; chipped, hand-painted');
assert('name', r17.name === 'bowl');
assert('fate keep', r17.fate === 'keep');
assert('notes with comma', r17.notes === 'chipped, hand-painted');
assert('no warning', !r17.warning);

console.log('\n18. Semicolon: commas free in name too');
var r18 = parseItemEntry('bowl, ceramic; donate; from goodwill, used');
assert('name with comma', r18.name === 'bowl, ceramic');
assert('fate donate', r18.fate === 'donate');
assert('notes with comma', r18.notes === 'from goodwill, used');

console.log('\n19. Semicolon: unrecognized fate -> unsure + warning');
var r19 = parseItemEntry('bowl; notafate; some notes');
assert('fate unsure', r19.fate === 'unsure');
assert('notes preserved', r19.notes === 'some notes');
assert('warning shown', !!r19.warning);
assert('warning mentions notafate', r19.warning.includes('notafate'));

console.log('\n20. Semicolon: second part not a fate -> notes, fate unsure');
var r20 = parseItemEntry('bowl; chipped rim');
assert('fate unsure', r20.fate === 'unsure');
assert('notes chipped rim', r20.notes === 'chipped rim');
assert('warning shown', !!r20.warning);

console.log('\n21. Semicolon: extra semicolons joined back into notes');
var r21 = parseItemEntry('bowl; keep; note one; note two');
assert('fate keep', r21.fate === 'keep');
assert('notes joined', r21.notes === 'note one; note two');

console.log('\n22. Semicolon: all six fates recognized');
FATES.forEach(function(fate) {
  var r = parseItemEntry('widget; ' + fate);
  assert(fate + ' recognized', r.fate === fate && r.notes === null);
});

console.log('\n23. Semicolon mode via handleItemName: name; fate; notes -> BOX_OPEN');
reset(); makeBox('Kitchen');
handleItemName('bowl, ceramic; keep; chipped, hand-painted from Mexico');
assert('stage BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assert('name with comma', activeBox().items[0].name === 'bowl, ceramic');
assert('fate keep', activeBox().items[0].fate === 'keep');
assert('notes with comma', activeBox().items[0].notes === 'chipped, hand-painted from Mexico');

console.log('\n24. Semicolons take priority over commas when both present');
var r24 = parseItemEntry('a, b; keep; c, d');
assert('uses semicolons', r24.name === 'a, b');
assert('fate keep', r24.fate === 'keep');
assert('notes c, d', r24.notes === 'c, d');

console.log('\n' + '\u2500'.repeat(40));
console.log((failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
