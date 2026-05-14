// test_multiline.js — Tests for multi-line item entry (processMultilineItems)
// Run from project root: node tests/test_multiline.js

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
var processMultilineItems = app.processMultilineItems;
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
  state.conversationStage = 'BOX_OPEN';
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
function items() { return activeBox().items.filter(function(i) { return !i.deleted_at; }); }

console.log('\nprocessMultilineItems tests\n');

console.log('1. All well-formed lines added correctly');
reset(); makeBox('Kitchen');
processMultilineItems(['bowl, keep, chipped', 'plate, donate', 'mug, sell']);
assert('3 items added', items().length === 3);
assert('bowl fate keep', items()[0].fate === 'keep');
assert('bowl notes', items()[0].notes === 'chipped');
assert('plate fate donate', items()[1].fate === 'donate');
assert('mug fate sell', items()[2].fate === 'sell');
assert('stage BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assert('no error in message', !lastBotMessage.includes('formatting issues'));

console.log('\n2. Summary shows correct count');
reset(); makeBox('Kitchen');
processMultilineItems(['bowl, keep', 'plate, donate', 'mug, sell', 'spoon, trash']);
assert('4 items added message', lastBotMessage.includes('4 items added'));

console.log('\n3. Name-only lines logged as unsure silently');
reset(); makeBox('Kitchen');
processMultilineItems(['bowl', 'plate']);
assert('2 items added', items().length === 2);
assert('bowl unsure', items()[0].fate === 'unsure');
assert('plate unsure', items()[1].fate === 'unsure');
assert('no error in message', !lastBotMessage.includes('formatting issues'));

console.log('\n4. Unrecognized fate -> unsure, line cached and shown in summary');
reset(); makeBox('Kitchen');
processMultilineItems(['bowl, badFate, some notes', 'plate, keep']);
assert('2 items added', items().length === 2);
assert('bowl unsure', items()[0].fate === 'unsure');
assert('bowl notes preserved', items()[0].notes === 'some notes');
assert('plate keep', items()[1].fate === 'keep');
assert('error in message', lastBotMessage.includes('formatting issues'));
assert('original line shown', lastBotMessage.includes('bowl, badFate, some notes'));

console.log('\n5. Empty lines skipped silently');
reset(); makeBox('Kitchen');
processMultilineItems(['bowl, keep', '', '   ', 'plate, donate']);
assert('2 items (empty lines skipped)', items().length === 2);

console.log('\n6. Semicolon format works in multiline');
reset(); makeBox('Kitchen');
processMultilineItems(['bowl, ceramic; keep; chipped, hand-painted', 'plate; donate']);
assert('2 items added', items().length === 2);
assert('name with comma', items()[0].name === 'bowl, ceramic');
assert('fate keep', items()[0].fate === 'keep');
assert('notes with comma', items()[0].notes === 'chipped, hand-painted');

console.log('\n7. Batch quantity expanded inline');
reset(); makeBox('Kitchen');
processMultilineItems(['3 bowls', 'plate, keep']);
assert('4 items total (3 batch + 1)', items().length === 4);
assert('batch items named correctly', items()[0].name === 'bowls');
assert('batch items unsure', items()[0].fate === 'unsure');
assert('plate keep', items()[3].fate === 'keep');

console.log('\n8. Multiple errors all reported in summary');
reset(); makeBox('Kitchen');
processMultilineItems(['bowl, badFate', 'plate, alsobad', 'mug, keep']);
assert('3 items added', items().length === 3);
assert('both error lines shown', lastBotMessage.includes('bowl, badFate') && lastBotMessage.includes('plate, alsobad'));

console.log('\n9. activeItemId cleared after batch');
reset(); makeBox('Kitchen');
processMultilineItems(['bowl, keep', 'plate, donate']);
assert('no active item after batch', state.activeItemId === null);

console.log('\n10. All six fates accepted in multiline');
reset(); makeBox('Kitchen');
processMultilineItems(FATES.map(function(fate) { return 'item, ' + fate; }));
assert('6 items added', items().length === 6);
FATES.forEach(function(fate, i) {
  assert(fate + ' accepted', items()[i].fate === fate);
});

console.log('\n\u2500'.repeat(40));
console.log((failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
