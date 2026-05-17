// test_main_quest.js — Tests for Main Quest / Progress Tracking (Milestone 1)
// Run with: node test_main_quest.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var lastChips = [];

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

var app         = require('../app.js');
var state       = app.state;
var uid         = app.uid;
var processInput = app.processInput;

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
  state.hasSeenProgressPrompt = false;
  lastBotMessage = null;
  lastChips = [];
}
function makeBox(name, location) {
  var box = { id: uid(), name: name, location: location || '', notes: '', parentId: null, createdAt: '', items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}
function addItem(box, name, fate) {
  var item = { id: uid(), name: name, fate: fate || 'unsure', notes: '', qty: 1 };
  box.items.push(item);
  return item;
}

console.log('\nMain Quest - Milestone 1: Show Progress\n');

// 1. "show progress" command works with zero boxes
console.log('1. "show progress" with no boxes shows zero counts');
reset();
processInput('show progress', []);
assertIncludes('mentions boxes', lastBotMessage, 'box');
assertIncludes('mentions items', lastBotMessage, 'item');
assertIncludes('shows zero boxes', lastBotMessage, '0');

// 2. "show progress" command shows accurate box count
console.log('\n2. "show progress" shows accurate box count');
reset();
makeBox('Box A', 'Garage');
makeBox('Box B', 'Kitchen');
makeBox('Box C', 'Bedroom');
processInput('show progress', []);
assertIncludes('shows 3 boxes', lastBotMessage, '3');
assertIncludes('plural boxes', lastBotMessage, 'boxes');

// 3. "show progress" shows accurate item count
console.log('\n3. "show progress" shows accurate item count and fate breakdown');
reset();
var boxA = makeBox('Box A', 'Garage');
addItem(boxA, 'Item 1', 'keep');
addItem(boxA, 'Item 2', 'keep');
addItem(boxA, 'Item 3', 'donate');
var boxB = makeBox('Box B', 'Kitchen');
addItem(boxB, 'Item 4', 'sell');
addItem(boxB, 'Item 5', 'trash');
processInput('show progress', []);
assertIncludes('shows 5 items', lastBotMessage, '5');
assertIncludes('shows keep count', lastBotMessage, 'Keep 2');
assertIncludes('shows donate count', lastBotMessage, 'Donate 1');
assertIncludes('shows sell count', lastBotMessage, 'Sell 1');
assertIncludes('shows trash count', lastBotMessage, 'Trash 1');

// 4. "progress" shorthand also works
console.log('\n4. "progress" shorthand works');
reset();
makeBox('Box A', 'Garage');
processInput('progress', []);
assertIncludes('responds to progress', lastBotMessage, 'box');
assert('shows stats', lastBotMessage.indexOf('1') !== -1);

// 5. Singular forms when count is 1
console.log('\n5. Uses singular "box" and "item" when count is 1');
reset();
var box = makeBox('Solo Box', 'Garage');
addItem(box, 'Solo Item', 'keep');
processInput('show progress', []);
assertIncludes('singular box', lastBotMessage, '1');
assertIncludes('uses box not boxes', lastBotMessage, 'box');
assertIncludes('uses item not items', lastBotMessage, 'item');

// 6. Help text mentions "show progress"
console.log('\n6. Help text includes "show progress" command');
reset();
makeBox('Test Box', 'Bedroom');
processInput('help', []);
assertIncludes('help mentions show progress', lastBotMessage, 'Show progress');

// 7. Progress always shows Map remaining work chip
console.log('\n7. "show progress" always offers mapping option');
reset();
for (var i = 1; i <= 10; i++) {
  makeBox('Box ' + i, 'Location ' + i);
}
processInput('show progress', []);
assertIncludes('shows box count', lastBotMessage, '10');
assert('offers Map remaining work chip', lastChips.indexOf('Map remaining work') !== -1);

// 8. Mapping chip shown regardless of box count
console.log('\n8. "show progress" offers mapping even with few boxes');
reset();
makeBox('Box 1', 'Location');
makeBox('Box 2', 'Location');
processInput('show progress', []);
assert('Map remaining work chip shown', lastChips.indexOf('Map remaining work') !== -1);

// 9. Map remaining work chip appears in FINISHED stage
console.log('\n9. "Map remaining work" chip in FINISHED stage');
reset();
makeBox('Box A', 'Garage');
state.conversationStage = 'FINISHED';
processInput('show progress', []);
assert('Map remaining work chip in FINISHED', lastChips.indexOf('Map remaining work') !== -1);

// 10. Ignores soft-deleted boxes and items
console.log('\n10. Ignores soft-deleted boxes and items in count');
reset();
var activeBox = makeBox('Active Box', 'Garage');
addItem(activeBox, 'Active Item', 'keep');
addItem(activeBox, 'Deleted Item', 'trash');
activeBox.items[1].deleted_at = new Date().toISOString();
var deletedBox = makeBox('Deleted Box', 'Attic');
deletedBox.deleted_at = new Date().toISOString();
processInput('show progress', []);
assertIncludes('counts only 1 box', lastBotMessage, '1');
assertIncludes('counts only 1 item', lastBotMessage, '1');

// 11. "Just show stats" chip shows full progress
console.log('\n11. "Just show stats" chip shows full progress with fates');
reset();
var testBox = makeBox('Box 1', 'Location');
addItem(testBox, 'cable 1', 'keep');
addItem(testBox, 'cable 2', 'keep');
addItem(testBox, 'Item 3', 'donate');
processInput('just show stats', []);
assertIncludes('shows box count', lastBotMessage, '1');
assertIncludes('shows item count', lastBotMessage, '3');
assertIncludes('shows fate breakdown', lastBotMessage, 'Keep 2');
assert('offers mapping', lastChips.indexOf('Map remaining work') !== -1);

// 12. "Not yet" chip dismisses and reminds about command
console.log('\n12. "Not yet" chip dismisses politely');
reset();
makeBox('Test Box', 'Garage');
processInput('not yet', []);
assertIncludes('dismisses politely', lastBotMessage, 'No problem');
assertIncludes('reminds about command', lastBotMessage, 'Show progress');

// 13. "Map remaining work" shows placeholder
console.log('\n13. "Map remaining work" shows placeholder for M3');
reset();
var mapBox = makeBox('Test Box', 'Garage');
addItem(mapBox, 'Test Item', 'keep');
processInput('map remaining work', []);
assertIncludes('suggests map command', lastBotMessage, 'map 5 boxes in garage');
assertIncludes('shows stats anyway', lastBotMessage, '1');

// 14. Common words detected in item names
console.log('\n14. Detects common words in item names');
reset();
var wordBox = makeBox('Cable Box', 'Garage');
addItem(wordBox, 'usb cable', 'keep');
addItem(wordBox, 'hdmi cable', 'keep');
addItem(wordBox, 'power cable', 'keep');
addItem(wordBox, 'ethernet cable', 'donate');
addItem(wordBox, 'phone charger', 'sell');
addItem(wordBox, 'laptop charger', 'sell');
addItem(wordBox, 'tablet charger', 'sell');
processInput('show progress', []);
assertIncludes('detects cable', lastBotMessage, 'cable');
assertIncludes('detects charger', lastBotMessage, 'charger');

// 15. Common words detected in notes
console.log('\n15. Detects common words in notes');
reset();
var notesBox = makeBox('Test Box', 'Garage');
var item1 = addItem(notesBox, 'Item 1', 'keep');
item1.notes = 'broken screen needs repair';
var item2 = addItem(notesBox, 'Item 2', 'keep');
item2.notes = 'screen cracked repair later';
var item3 = addItem(notesBox, 'Item 3', 'donate');
item3.notes = 'screen works fine just old';
var item4 = addItem(notesBox, 'Item 4', 'trash');
item4.notes = 'totally broken cannot repair';
var item5 = addItem(notesBox, 'Item 5', 'sell');
item5.notes = 'broken hinge but screen ok';
var item6 = addItem(notesBox, 'Item 6', 'unsure');
item6.notes = 'repair costs unknown';
processInput('show progress', []);
assertIncludes('detects screen in notes', lastBotMessage.toLowerCase(), 'screen');
assertIncludes('detects broken in notes', lastBotMessage.toLowerCase(), 'broken');

// 16. Fate labels are clickable
console.log('\n16. Fate labels have onclick handlers for review');
reset();
var clickBox = makeBox('Test Box', 'Garage');
addItem(clickBox, 'Item 1', 'keep');
addItem(clickBox, 'Item 2', 'donate');
addItem(clickBox, 'Item 3', 'trash');
processInput('show progress', []);
assertIncludes('keep has onclick', lastBotMessage, 'onclick');
assertIncludes('keep triggers review', lastBotMessage, 'review keep');
assertIncludes('donate triggers review', lastBotMessage, 'review donate');
assertIncludes('trash triggers review', lastBotMessage, 'review trash');

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
