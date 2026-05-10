// test_move.js — Tests for the "move box" feature
// Run with: node test_move.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
// Set stubs as globals so app.js can call them after require()

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

global.localStorage = {
  getItem: function() { return null; },
  setItem: function() {},
  removeItem: function() {}
};

global.JSZip = function() {};

// Load app.js and pull exports into global scope
var app = require('../app.js');
var state = app.state;
var FATES = app.FATES;
var uid = app.uid;
var activeBox = app.activeBox;
var activeItem = app.activeItem;
var countFates = app.countFates;
var processInput = app.processInput;
var handleMove = app.handleMove;

// ── TEST HARNESS ──────────────────────────────────────────────────────────────
var passed = 0;
var failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log('  \u2705 ' + desc);
    passed++;
  } else {
    console.error('  \u274c ' + desc);
    failed++;
  }
}

function assertIncludes(desc, haystack, needle) {
  assert(desc, haystack && haystack.indexOf(needle) !== -1);
}

function reset() {
  // Reset state to a clean slate with one active box
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;
  state.pendingBatch = null;
  state.conversationStage = 'BOX_OPEN';
  lastBotMessage = null;
  lastChips = [];
}

function makeBox(name, location) {
  var box = { id: uid(), name: name, location: location || '', notes: '', createdAt: new Date().toISOString(), items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}

// ── TESTS ─────────────────────────────────────────────────────────────────────

console.log('\nMove Box Feature Tests\n');

// 1. "move garage" — inline location
console.log('1. move <location> updates location immediately');
reset();
var box = makeBox('Bedroom Box', 'bedroom');
processInput('move garage', []);
assert('location updated to garage', box.location === 'garage');
assertIncludes('confirms move in message', lastBotMessage, 'garage');
assertIncludes('confirms old location in message', lastBotMessage, 'bedroom');
assert('stage remains BOX_OPEN', state.conversationStage === 'BOX_OPEN');

// 2. "m kitchen" — shorthand with inline location
console.log('\n2. m <location> shorthand updates location');
reset();
box = makeBox('Garage Box', 'garage');
processInput('m kitchen', []);
assert('location updated to kitchen', box.location === 'kitchen');
assertIncludes('confirms move', lastBotMessage, 'kitchen');

// 3. "move" alone — prompts for location
console.log('\n3. move alone prompts for location');
reset();
box = makeBox('Study Box', 'study');
processInput('move', []);
assert('stage set to AWAITING_MOVE_LOCATION', state.conversationStage === 'AWAITING_MOVE_LOCATION');
assertIncludes('asks where to move', lastBotMessage, 'Where');
assert('location not changed yet', box.location === 'study');

// 4. "m" alone — prompts for location
console.log('\n4. m alone prompts for location');
reset();
box = makeBox('Attic Box', 'attic');
processInput('m', []);
assert('stage set to AWAITING_MOVE_LOCATION', state.conversationStage === 'AWAITING_MOVE_LOCATION');
assert('location not changed yet', box.location === 'attic');

// 5. Follow-up answer after prompt
console.log('\n5. Location answer after prompt completes the move');
reset();
box = makeBox('Spare Box', 'spare room');
processInput('move', []);
assert('waiting for location', state.conversationStage === 'AWAITING_MOVE_LOCATION');
processInput('basement', []);
assert('location updated to basement', box.location === 'basement');
assertIncludes('confirms move', lastBotMessage, 'basement');
assertIncludes('mentions old location', lastBotMessage, 'spare room');
assert('stage back to BOX_OPEN', state.conversationStage === 'BOX_OPEN');

// 6. Move with no active box
console.log('\n6. move with no active box shows error');
reset();
// no box created, no activeBoxId
processInput('move garage', []);
assertIncludes('tells user no active box', lastBotMessage, 'No active box');

// 7. Move box chip ("Move box") triggers prompt
console.log('\n7. Move box chip triggers move flow');
reset();
box = makeBox('Living Room Box', 'living room');
// chipClick maps "Move box" -> "move", then calls sendUserMessage
// We can test handleMove directly here
handleMove('');
assert('stage set to AWAITING_MOVE_LOCATION', state.conversationStage === 'AWAITING_MOVE_LOCATION');

// 8. Move preserves all items
console.log('\n8. Move preserves existing items');
reset();
box = makeBox('Box With Items', 'hallway');
box.items.push({ id: uid(), name: 'Lamp', fate: 'keep', description: '', notes: '', photos: [], createdAt: new Date().toISOString() });
box.items.push({ id: uid(), name: 'Chair', fate: 'donate', description: '', notes: '', photos: [], createdAt: new Date().toISOString() });
processInput('move storage unit', []);
assert('items count unchanged', box.items.length === 2);
assert('location updated', box.location === 'storage unit');

// 9. Move mid-item (during AWAITING_FATE) still works and restores stage
console.log('\n9. Move works mid-item and does not corrupt item stage');
reset();
box = makeBox('Mid-Item Box', 'office');
var item = { id: uid(), name: 'Stapler', fate: 'unsure', description: '', notes: '', photos: [], createdAt: new Date().toISOString() };
box.items.push(item);
state.activeItemId = item.id;
state.conversationStage = 'AWAITING_FATE';
processInput('move storeroom', []);
assert('location updated', box.location === 'storeroom');
// Stage should not be clobbered to BOX_OPEN since we weren't in AWAITING_MOVE_LOCATION
assert('AWAITING_FATE stage preserved', state.conversationStage === 'AWAITING_FATE');

// 10. Multi-word location
console.log('\n10. Multi-word location is stored in full');
reset();
box = makeBox('Mystery Box', 'unknown');
processInput('move third shelf of the garage', []);
assert('full location stored', box.location === 'third shelf of the garage');

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
