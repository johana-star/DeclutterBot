// test_reset.js — Tests for the reset command confirm flow
// Run with: node test_reset.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var lastChips = [];

// Intercept addBotMessage/setChips at the global level before module load
global.addBotMessage = function(text) { lastBotMessage = text; };
global.addUserMessage = function() {};
global.setChips = function(chips) { lastChips = chips || []; };
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
// window.confirm must never be called — reset uses a conversational flow now
global.confirm = function() { throw new Error('window.confirm must not be called — use conversational flow'); };
// Minimal document stub — addBotMessage/setChips are intercepted globally above,
// so DOM methods are only needed for guards that check document existence.
global.document = {
  getElementById: function(id) {
    return { innerHTML: '', classList: { add: function(){}, remove: function(){} },
             appendChild: function(){}, scrollTop: 0, scrollHeight: 0,
             querySelectorAll: function(){ return []; } };
  },
  createElement: function() {
    return { className: '', innerHTML: '', appendChild: function(){} };
  }
};
global.URL = { createObjectURL: function() { return ''; }, revokeObjectURL: function() {} };

var app = require('../app.js');
var state = app.state;
var clearAll = app.clearAll;
var processInput = app.processInput;
var FATES = app.FATES;

// Patch internal _setChipsImpl so chip calls through the DOM path are also captured
app._setChipsImpl = function(chips) { lastChips = chips || []; };
var processInput = app.processInput;
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
  lastChips = [];
}

function addBox(name) {
  state.boxes.push({
    id: 'b' + state.boxes.length,
    name: name,
    location: 'living room',
    notes: '',
    parentId: null,
    createdAt: '',
    items: []
  });
}

function addItem(boxIdx, name) {
  state.boxes[boxIdx].items.push({
    id: 'i' + Math.random().toString(36).slice(2),
    name: name,
    fate: 'unsure',
    notes: '',
    deleted_at: null,
    description: '',
    createdAt: ''
  });
}

// ── TESTS ─────────────────────────────────────────────────────────────────────
console.log('\nReset Command Tests\n');

console.log('1. reset with empty inventory skips confirm and resets immediately');
reset();
clearAll();
assert('no confirm stage set', state.conversationStage !== 'AWAITING_RESET_CONFIRM');
assert('boxes still empty', state.boxes.length === 0);

console.log('\n2. reset with data enters confirm stage');
reset();
addBox('Kitchen');
addItem(0, 'Bowl');
clearAll();
assert('stage is AWAITING_RESET_CONFIRM', state.conversationStage === 'AWAITING_RESET_CONFIRM');
assert('Yes and No chips shown', lastChips.includes('Yes') && lastChips.includes('No'));
assert('message mentions box count', lastBotMessage.includes('1 box'));
assert('message mentions item count', lastBotMessage.includes('1 item'));
assert('data not cleared yet', state.boxes.length === 1);

console.log('\n3. confirming reset clears all data');
reset();
addBox('Kitchen');
addItem(0, 'Bowl');
clearAll();                     // enters confirm stage
processInput('yes');            // confirm
assert('boxes cleared', state.boxes.length === 0);
assert('activeBoxId cleared', state.activeBoxId === null);

console.log('\n4. cancelling reset preserves data');
reset();
addBox('Kitchen');
addItem(0, 'Bowl');
clearAll();                     // enters confirm stage
processInput('no');             // cancel
assert('boxes preserved', state.boxes.length === 1);
assert('cancel message shown', lastBotMessage.toLowerCase().includes('cancelled'));
assert('stage leaves confirm', state.conversationStage !== 'AWAITING_RESET_CONFIRM');

console.log('\n5. "yes" chip in confirm stage triggers reset');
reset();
addBox('Bedroom');
clearAll();
processInput('yes');
assert('reset on Yes chip', state.boxes.length === 0);

console.log('\n6. "start over" command also enters confirm flow');
reset();
addBox('Kitchen');
processInput('start over');
assert('stage is AWAITING_RESET_CONFIRM', state.conversationStage === 'AWAITING_RESET_CONFIRM');

console.log('\n7. reset counts only non-deleted items in warning');
reset();
addBox('Kitchen');
addItem(0, 'Bowl');
addItem(0, 'Plate');
state.boxes[0].items[1].deleted_at = new Date().toISOString(); // soft-delete Plate
clearAll();
assert('message shows 1 item (not 2)', lastBotMessage.includes('1 item'));

console.log('\n8. confirm required every time — re-entering confirm after cancel');
reset();
addBox('Kitchen');
clearAll();
processInput('no');             // cancel first time
assert('data still there after cancel', state.boxes.length === 1);
clearAll();                     // try again
assert('confirm required again', state.conversationStage === 'AWAITING_RESET_CONFIRM');

console.log('\n9. window.confirm is never called');
// Verified by the stub above which throws — all tests above have passed without it throwing

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log('✅ ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
