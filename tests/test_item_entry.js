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

console.log('\n5. Four parts: name+comma, fate, notes');
var r5 = parseItemEntry('bowl, ceramic, keep, chipped rim');
assert('name with comma', r5.name === 'bowl, ceramic');
assert('fate keep', r5.fate === 'keep');
assert('notes', r5.notes === 'chipped rim');

console.log('\n6. Trailing comma (empty notes)');
var r6 = parseItemEntry('bowl, ceramic, keep,');
assert('name with comma', r6.name === 'bowl, ceramic');
assert('fate keep', r6.fate === 'keep');
assert('notes empty string', r6.notes === '');

console.log('\n7. Five parts: name+two commas, fate, notes');
var r7 = parseItemEntry('bowl, ceramic, blue, donate, from grandma');
assert('name', r7.name === 'bowl, ceramic, blue');
assert('fate donate', r7.fate === 'donate');
assert('notes', r7.notes === 'from grandma');

console.log('\n8. Unrecognized fate in 3-part');
var r8 = parseItemEntry('bowl, ceramic, badFate');
assert('fate unsure', r8.fate === 'unsure');
assert('warning', !!r8.warning);

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

console.log('\n13. 4-part (comma in name) -> BOX_OPEN');
reset(); makeBox('Kitchen');
handleItemName('bowl, ceramic, donate, from goodwill');
assert('stage BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assert('name bowl, ceramic', activeBox().items[0].name === 'bowl, ceramic');
assert('fate donate', activeBox().items[0].fate === 'donate');
assert('notes', activeBox().items[0].notes === 'from goodwill');

console.log('\n14. Trailing comma (empty notes) -> BOX_OPEN');
reset(); makeBox('Kitchen');
handleItemName('bowl, ceramic, sell,');
assert('stage BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assert('name bowl, ceramic', activeBox().items[0].name === 'bowl, ceramic');
assert('fate sell', activeBox().items[0].fate === 'sell');
assert('notes empty', activeBox().items[0].notes === '');

console.log('\n15. All six fates as second part');
FATES.forEach(function(fate) {
  reset(); makeBox('Kitchen');
  handleItemName('widget, ' + fate);
  assert(fate + ' accepted', activeBox().items[0].fate === fate);
});

console.log('\n' + String.fromCharCode(8212).repeat(40));
console.log('\u2705 ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
