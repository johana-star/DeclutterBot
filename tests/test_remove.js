// test_remove.js — Tests for the "remove item" feature
// Run with: node test_remove.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var lastChips = [];

global.addBotMessage = function(text) { lastBotMessage = text; };
global.addUserMessage = function() {};
global.setChips = function(chips) { lastChips = chips; };
global.renderSidebar = function() {};
global.updateContextBar = function() {};
global.showTyping = function() {};
global.hideTyping = function() {};
global.saveState = function() {};
global.chipClick = function() {};
global.escHtml = function(s) { return String(s||''); };
global.renderMarkdown = function(s) { return s; };
global.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };
global.JSZip = function() {};

var app = require('../app.js');
var state        = app.state;
var uid          = app.uid;
var activeBox    = app.activeBox;
var processInput = app.processInput;
var handleRemove = app.handleRemove;

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
  state.conversationStage = 'BOX_OPEN';
  state.conversationHistory = [];
  lastBotMessage = null;
  lastChips = [];
}

function makeBox(name, location) {
  var box = { id: uid(), name: name, location: location || '', notes: '', createdAt: new Date().toISOString(), items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}

function makeItem(box, name, fate) {
  var item = { id: uid(), name: name, fate: fate || 'unsure', description: '', notes: '', photos: [], addedAt: new Date().toISOString() };
  box.items.push(item);
  return item;
}

// ── TESTS ─────────────────────────────────────────────────────────────────────
console.log('\nRemove Item Feature Tests\n');

// 1. Remove by exact name
console.log('1. remove <exact name> removes the item');
reset();
var box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
makeItem(box, 'Chair', 'donate');
processInput('remove Lamp', []);
assert('item count decremented', box.items.length === 1);
assert('correct item removed', box.items[0].name === 'Chair');
assertIncludes('confirms removal', lastBotMessage, 'Lamp');

// 2. Remove by number
console.log('\n2. remove <number> removes item at that position');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Book', 'keep');
makeItem(box, 'Vase', 'sell');
processInput('remove 1', []);
assert('item count decremented', box.items.length === 1);
assert('correct item removed', box.items[0].name === 'Vase');
assertIncludes('confirms removal', lastBotMessage, 'Book');

// 3. Remove last item in box
console.log('\n3. remove last item leaves empty box');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Sock', 'trash');
processInput('remove 1', []);
assert('box is now empty', box.items.length === 0);
assertIncludes('confirms removal', lastBotMessage, 'Sock');

// 4. Remove by case-insensitive name
console.log('\n4. remove is case-insensitive');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Old Lamp', 'unsure');
processInput('remove old lamp', []);
assert('item removed', box.items.length === 0);

// 5. Remove by partial name match
console.log('\n5. remove matches partial name');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Vintage Lamp', 'unsure');
processInput('remove lamp', []);
assert('item removed via partial match', box.items.length === 0);

// 6. Remove non-existent item
console.log('\n6. remove unknown name shows helpful error');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Chair', 'keep');
processInput('remove Sofa', []);
assert('item not removed', box.items.length === 1);
assertIncludes('suggests review items', lastBotMessage, 'review items');

// 7. Remove out-of-range number
console.log('\n7. remove out-of-range number shows helpful error');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Chair', 'keep');
processInput('remove 5', []);
assert('item not removed', box.items.length === 1);
assertIncludes('suggests review items', lastBotMessage, 'review items');

// 8. Remove with no active box
console.log('\n8. remove with no active box shows error');
reset();
processInput('remove Lamp', []);
assertIncludes('tells user no active box', lastBotMessage, 'No active box');

// 9. Remove with no argument prompts for clarification
console.log('\n9. remove with no argument prompts for clarification');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Chair', 'keep');
processInput('remove', []);
assert('nothing removed', box.items.length === 1);
assertIncludes('gives usage hint', lastBotMessage, 'remove');

// 10. "delete" alias works
console.log('\n10. delete <name> alias works');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Mirror', 'keep');
processInput('delete Mirror', []);
assert('item removed via delete alias', box.items.length === 0);
assertIncludes('confirms removal', lastBotMessage, 'Mirror');

// 11. Remove active item clears activeItemId and resets stage
console.log('\n11. removing the active item clears activeItemId');
reset();
box = makeBox('Test Box', 'bedroom');
var item = makeItem(box, 'Stapler', 'unsure');
state.activeItemId = item.id;
state.conversationStage = 'AWAITING_FATE';
processInput('remove Stapler', []);
assert('item removed', box.items.length === 0);
assert('activeItemId cleared', state.activeItemId === null);
assert('stage reset to BOX_OPEN', state.conversationStage === 'BOX_OPEN');

// 12. Remove one item from a batch, others remain
console.log('\n12. remove by group number removes all items in that group');
reset();
box = makeBox('Test Box', 'bedroom');
var now = new Date().toISOString();
for (var i = 0; i < 3; i++) {
  box.items.push({ id: uid(), name: 'Paper towel roll', fate: 'keep', description: '', notes: '', photos: [], addedAt: now });
}
processInput('remove 1', []); // group 1 = all 3 Paper towel rolls
assert('all items in group removed', box.items.length === 0);
assert('confirms count in removal message', lastBotMessage && lastBotMessage.indexOf('3') !== -1);


// 13. After removing an item the updated list is shown
console.log('\n13. After remove, updated item list is shown');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
makeItem(box, 'Chair', 'donate');
processInput('remove 1', []);
assert('item removed', box.items.length === 1);
assertIncludes('remaining items shown in message', lastBotMessage, 'Chair');
assertIncludes('remaining items shown in message', lastBotMessage, 'Remaining');

// 14. After removing an item, remove chips are shown for remaining items
console.log('\n14. After remove, remove chips shown for remaining items');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
makeItem(box, 'Chair', 'donate');
processInput('remove 1', []);
assert('Remove 1 chip shown for remaining item', lastChips.indexOf('Remove 1') !== -1);
assert('no Remove 2 chip (only 1 item left)', lastChips.indexOf('Remove 2') === -1);

// 15. After removing last item, empty box message and no remove chips
console.log('\n15. After removing last item, empty state shown');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
processInput('remove 1', []);
assert('box is empty', box.items.length === 0);
assertIncludes('empty message shown', lastBotMessage, 'empty');
assert('no remove chips shown', lastChips.indexOf('Remove 1') === -1);
assert('add item chip shown', lastChips.indexOf('Add item') !== -1);
// 16. "add item" with no active box shows error, not item prompt
console.log('\n16. add item with no active box shows error');
reset();
state.activeBoxId = null;
state.conversationStage = 'FINISHED'; // simulate no active box state
processInput('add item', []);
assertIncludes('explains no active box', lastBotMessage, 'No active box');
assert('stage not set to BOX_OPEN', state.conversationStage !== 'BOX_OPEN');
assert('no box created', state.boxes.length === 0);

// 17. "add item" with an active box works normally
console.log('\n17. add item with active box prompts for item');
reset();
var box = makeBox('Test Box', 'bedroom');
processInput('add item', []);
assert('stage set to BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assertIncludes('asks what the item is', lastBotMessage, 'item');

// ── SUMMARY ──────────────────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
