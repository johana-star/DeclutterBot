// test_search.js — Tests for search command and clickable progress words
// Run with: node tests/test_search.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
let lastBotMessage = null;
let lastChips = [];

global.addBotMessage    = function(text) { lastBotMessage = text; };
global.addUserMessage   = function() {};
global.setChips         = function(chips) { lastChips = chips; };
global.renderSidebar    = function() {};
global.updateContextBar = function() {};
global.showTyping       = function() {};
global.hideTyping       = function() {};
global.saveState        = function() {};
global.chipClick        = function() {};
global.escHtml          = function(s) { return String(s || ''); };
global.renderMarkdown   = function(s) { return s; };
global.localStorage     = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };

const app          = require('../app.js');
const state        = app.state;
const processInput = app.processInput;

// ── HARNESS ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}
function assertIncludes(desc, haystack, needle) {
  assert(desc, haystack != null && haystack.includes(needle));
}
function assertNotIncludes(desc, haystack, needle) {
  assert(desc, haystack == null || !haystack.includes(needle));
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
  state.pendingFateReview = null;
  state.conversationStage = 'FINISHED';
  state.mainQuest = {
    uncatalogedBoxes: [],
    completionEstimate: null,
    completedLocations: [],
    calibratedAt: null
  };
  lastBotMessage = null;
  lastChips = [];
}

function makeBox(name, location) {
  const box = {
    id: app.uid(),
    name,
    location: location || 'garage',
    notes: '',
    parentId: null,
    createdAt: new Date().toISOString(),
    items: []
  };
  state.boxes.push(box);
  return box;
}

function addItem(box, name, fate, notes) {
  const item = {
    id: app.uid(),
    name,
    fate: fate || 'keep',
    notes: notes || '',
    deleted_at: null,
    createdAt: new Date().toISOString()
  };
  box.items.push(item);
  return item;
}

console.log('\nSearch Command\n');

// ── BASIC SEARCH ──────────────────────────────────────────────────────────────

console.log('1. search returns items matching word in name');
reset();
const box1 = makeBox('Shelf A');
addItem(box1, 'hdmi cable', 'keep');
addItem(box1, 'usb cable', 'donate');
addItem(box1, 'old lamp', 'sell');
processInput('search cable', []);
assertIncludes('hdmi cable shown', lastBotMessage, 'hdmi cable');
assertIncludes('usb cable shown', lastBotMessage, 'usb cable');
assertNotIncludes('lamp not shown', lastBotMessage, 'old lamp');

console.log('\n2. search returns items matching word in notes');
reset();
const box2 = makeBox('Shelf B');
addItem(box2, 'mystery box', 'unsure', 'contains cables');
addItem(box2, 'other thing', 'keep', 'no match');
processInput('search cable', []);
assertIncludes('item with cable in notes shown', lastBotMessage, 'mystery box');
assertNotIncludes('non-matching item not shown', lastBotMessage, 'other thing');

console.log('\n3. search is case-insensitive');
reset();
const box3 = makeBox('Shelf C');
addItem(box3, 'HDMI Cable', 'keep');
processInput('search hdmi', []);
assertIncludes('uppercase name matched', lastBotMessage, 'HDMI Cable');

console.log('\n4. search includes items of all fates');
reset();
const box4 = makeBox('Multi fate shelf');
addItem(box4, 'cable keep', 'keep');
addItem(box4, 'cable trash', 'trash');
addItem(box4, 'cable donate', 'donate');
addItem(box4, 'cable sell', 'sell');
addItem(box4, 'cable unsure', 'unsure');
addItem(box4, 'cable return', 'return');
processInput('search cable', []);
assertIncludes('keep item shown', lastBotMessage, 'cable keep');
assertIncludes('trash item shown', lastBotMessage, 'cable trash');
assertIncludes('donate item shown', lastBotMessage, 'cable donate');
assertIncludes('sell item shown', lastBotMessage, 'cable sell');
assertIncludes('unsure item shown', lastBotMessage, 'cable unsure');
assertIncludes('return item shown', lastBotMessage, 'cable return');

console.log('\n5. search excludes soft-deleted items');
reset();
const box5 = makeBox('Deleted shelf');
const deleted = addItem(box5, 'deleted cable', 'keep');
deleted.deleted_at = new Date().toISOString();
addItem(box5, 'active cable', 'keep');
processInput('search cable', []);
assertNotIncludes('deleted item excluded', lastBotMessage, 'deleted cable');
assertIncludes('active item shown', lastBotMessage, 'active cable');

console.log('\n6. search groups results by box');
reset();
const boxA = makeBox('Kitchen shelf', 'kitchen');
const boxB = makeBox('Garage shelf', 'garage');
addItem(boxA, 'power cable', 'keep');
addItem(boxB, 'hdmi cable', 'keep');
addItem(boxB, 'usb cable', 'donate');
processInput('search cable', []);
assertIncludes('box A name shown', lastBotMessage, 'Kitchen shelf');
assertIncludes('box B name shown', lastBotMessage, 'Garage shelf');

console.log('\n7. search shows fate tag on each item');
reset();
const box6 = makeBox('Fate shelf');
addItem(box6, 'power cable', 'donate');
addItem(box6, 'hdmi cable', 'sell');
addItem(box6, 'usb cable', 'keep');
processInput('search cable', []);
assertIncludes('donate fate tag shown', lastBotMessage, 'fate-label-donate');
assertIncludes('sell fate tag shown', lastBotMessage, 'fate-label-sell');
assertIncludes('keep fate tag shown', lastBotMessage, 'fate-label-keep');

console.log('\n8. search shows item count in header');
reset();
const box7 = makeBox('Count shelf');
addItem(box7, 'cable 1', 'keep');
addItem(box7, 'cable 2', 'keep');
addItem(box7, 'cable 3', 'donate');
processInput('search cable', []);
assertIncludes('count shown', lastBotMessage, '3');

console.log('\n9. search shows the search word in header');
reset();
const box8 = makeBox('Word shelf');
addItem(box8, 'old monitor', 'sell');
addItem(box8, 'spare monitor', 'keep');
processInput('search monitor', []);
assertIncludes('search word in header', lastBotMessage, 'monitor');

console.log('\n10. Back chip always present');
reset();
const box9 = makeBox('Back shelf');
addItem(box9, 'cable', 'keep');
processInput('search cable', []);
assert('Back chip present', lastChips.includes('Back'));

console.log('\n11. No results shows friendly fallback');
reset();
makeBox('Empty shelf');
processInput('search xyzzy', []);
assertIncludes('fallback shown', lastBotMessage, 'No items found');
assertIncludes('search word in fallback', lastBotMessage, 'xyzzy');
assert('Back chip shown on fallback', lastChips.includes('Back'));

console.log('\n12. search works from BOX_OPEN stage (global intercept)');
reset();
const stageBox = makeBox('Stage shelf');
addItem(stageBox, 'power cable', 'keep');
state.conversationStage = 'BOX_OPEN';
state.activeBoxId = stageBox.id;
processInput('search cable', []);
assertIncludes('works from BOX_OPEN', lastBotMessage, 'power cable');

console.log('\n13. multi-word search works');
reset();
const box10 = makeBox('Multi shelf');
addItem(box10, 'power cable red', 'keep');
addItem(box10, 'power cable blue', 'keep');
addItem(box10, 'hdmi cable', 'keep');
processInput('search power cable', []);
assertIncludes('power cable red shown', lastBotMessage, 'power cable red');
assertIncludes('power cable blue shown', lastBotMessage, 'power cable blue');
assertNotIncludes('hdmi cable excluded', lastBotMessage, 'hdmi cable');

// ── CLICKABLE WORDS IN SHOW PROGRESS ─────────────────────────────────────────

console.log('\n14. Common name words are rendered as word-link spans');
reset();
const progressBox = makeBox('Progress shelf');
addItem(progressBox, 'hdmi cable', 'keep');
addItem(progressBox, 'usb cable', 'keep');
addItem(progressBox, 'power cable', 'donate');
addItem(progressBox, 'ethernet cable', 'sell');
addItem(progressBox, 'audio cable', 'unsure');
addItem(progressBox, 'video cable', 'trash');
processInput('show progress', []);
assertIncludes('word-link class present', lastBotMessage, 'word-link');
assertIncludes('cable has onclick', lastBotMessage, "search cable");

console.log('\n15. Common notes words are rendered as word-link spans');
reset();
const notesBox = makeBox('Notes shelf');
const ni1 = addItem(notesBox, 'item 1', 'keep'); ni1.notes = 'broken screen';
const ni2 = addItem(notesBox, 'item 2', 'keep'); ni2.notes = 'cracked screen';
const ni3 = addItem(notesBox, 'item 3', 'donate'); ni3.notes = 'screen works fine';
const ni4 = addItem(notesBox, 'item 4', 'trash'); ni4.notes = 'screen damaged badly';
const ni5 = addItem(notesBox, 'item 5', 'sell'); ni5.notes = 'screen replaced once';
const ni6 = addItem(notesBox, 'item 6', 'unsure'); ni6.notes = 'screen unknown';
processInput('show progress', []);
assertIncludes('notes word-link present', lastBotMessage, 'word-link');
assertIncludes('screen has onclick', lastBotMessage, "search screen");

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
