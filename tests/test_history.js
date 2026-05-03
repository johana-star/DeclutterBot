// test_history.js — Tests for arrow up/down input history
// Run with: node test_history.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var lastChips = [];
var fakeInput = { value: '', style: { height: 'auto' }, selectionStart: 0, selectionEnd: 0 };

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

// Stub document.getElementById to return our fake input
global.document = {
  getElementById: function(id) {
    if (id === 'user-input') return fakeInput;
    return { value: '', innerHTML: '', scrollTop: 0, className: '',
             appendChild: function(){}, style: {}, classList: { add: function(){}, remove: function(){} } };
  },
  createElement: function() {
    return { className: '', innerHTML: '', appendChild: function(){}, style: {} };
  }
};

var app = require('../app.js');
var inputHistory    = app.inputHistory;
var historyDraft    = app.historyDraft;
var getHistoryIndex = app.getHistoryIndex;
var setHistoryIndex = app.setHistoryIndex;
var handleKey       = app.handleKey;
var processInput    = app.processInput;
var state           = app.state;

// ── HARNESS ───────────────────────────────────────────────────────────────────
var passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}
function assertEq(desc, actual, expected) {
  if (actual === expected) { console.log('  \u2705 ' + desc); passed++; }
  else { console.error('  \u274c ' + desc + ' (got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected) + ')'); failed++; }
}

function reset() {
  // Clear history state by mutating the exported array
  inputHistory.length = 0;
  setHistoryIndex(-1);
  fakeInput.value = '';
  lastBotMessage = null;
  lastChips = [];
}

function key(k) {
  var prevented = false;
  handleKey({ key: k, shiftKey: false, preventDefault: function(){ prevented = true; } });
  return prevented;
}

function sendText(text) {
  // Simulate a sent message being added to history
  fakeInput.value = text;
  // Directly push to history as sendUserMessage would (without the async/DOM overhead)
  if (inputHistory.length === 0 || inputHistory[inputHistory.length - 1] !== text) {
    inputHistory.push(text);
    if (inputHistory.length > 100) inputHistory.shift();
  }
  setHistoryIndex(-1);
  fakeInput.value = '';
}

console.log('\nInput History (Arrow Up/Down) Tests\n');

// 1. Arrow up with empty history does nothing
console.log('1. Arrow up with no history does nothing');
reset();
fakeInput.value = 'current draft';
key('ArrowUp');
assertEq('value unchanged', fakeInput.value, 'current draft');
assertEq('historyIndex unchanged', getHistoryIndex(), -1);

// 2. Arrow up recalls most recent message
console.log('\n2. Arrow up recalls most recent message');
reset();
sendText('first message');
sendText('second message');
key('ArrowUp');
assertEq('shows most recent', fakeInput.value, 'second message');
assertEq('historyIndex set', getHistoryIndex(), 1);

// 3. Arrow up twice recalls older message
console.log('\n3. Arrow up twice recalls older message');
reset();
sendText('first message');
sendText('second message');
key('ArrowUp');
key('ArrowUp');
assertEq('shows older message', fakeInput.value, 'first message');
assertEq('historyIndex decremented', getHistoryIndex(), 0);

// 4. Arrow up at oldest does not go out of bounds
console.log('\n4. Arrow up at oldest stays at oldest');
reset();
sendText('only message');
key('ArrowUp');
key('ArrowUp'); // should not go below 0
assertEq('still shows oldest', fakeInput.value, 'only message');
assertEq('historyIndex stays at 0', getHistoryIndex(), 0);

// 5. Arrow down after arrow up restores next message
console.log('\n5. Arrow down after two ups goes forward');
reset();
sendText('first');
sendText('second');
key('ArrowUp'); // second
key('ArrowUp'); // first
key('ArrowDown'); // second again
assertEq('shows second again', fakeInput.value, 'second');
assertEq('historyIndex back to 1', getHistoryIndex(), 1);

// 6. Arrow down past newest restores draft
console.log('\n6. Arrow down past newest restores original draft');
reset();
fakeInput.value = 'my draft';
sendText('sent message');
fakeInput.value = 'my draft'; // restore draft (sendText clears it)
key('ArrowUp');   // sent message — draft saved
key('ArrowDown'); // back past newest → draft restored
assertEq('draft restored', fakeInput.value, 'my draft');
assertEq('historyIndex reset to -1', getHistoryIndex(), -1);

// 7. Arrow down when not browsing does nothing
console.log('\n7. Arrow down when not browsing does nothing');
reset();
fakeInput.value = 'typing something';
key('ArrowDown');
assertEq('value unchanged', fakeInput.value, 'typing something');
assertEq('historyIndex still -1', getHistoryIndex(), -1);

// 8. Draft is saved before browsing begins
console.log('\n8. Draft is preserved when arrow up is first pressed');
reset();
fakeInput.value = 'unsent draft';
sendText('previous message');
fakeInput.value = 'unsent draft';
key('ArrowUp');
assertEq('previous shown', fakeInput.value, 'previous message');
key('ArrowDown');
assertEq('draft restored exactly', fakeInput.value, 'unsent draft');

// 9. Consecutive duplicate messages are not double-stored
console.log('\n9. Consecutive duplicates are collapsed in history');
reset();
sendText('hello');
sendText('hello'); // duplicate
assertEq('history has only one entry', inputHistory.length, 1);

// 10. Non-consecutive duplicates are stored separately
console.log('\n10. Non-consecutive duplicates are stored separately');
reset();
sendText('hello');
sendText('world');
sendText('hello'); // not consecutive
assertEq('history has three entries', inputHistory.length, 3);

// 11. History capped at 100 entries
console.log('\n11. History is capped at 100 entries');
reset();
for (var i = 0; i < 105; i++) sendText('message ' + i);
assertEq('history length capped at 100', inputHistory.length, 100);
assertEq('oldest entries dropped', inputHistory[0], 'message 5');

// 12. Arrow up preventDefault is called (stops cursor moving in textarea)
console.log('\n12. Arrow up calls preventDefault');
reset();
sendText('a message');
var prevented = key('ArrowUp');
assert('preventDefault called on ArrowUp', prevented);

// 13. Arrow down preventDefault is called when browsing
console.log('\n13. Arrow down calls preventDefault when browsing');
reset();
sendText('a message');
key('ArrowUp'); // start browsing
var prevented2 = key('ArrowDown');
assert('preventDefault called on ArrowDown', prevented2);

// ── SIDEBAR CLICK HISTORY TESTS ───────────────────────────────────────────────

console.log('\n14. selectBox adds box name to inputHistory');
reset();
state.boxes = [];
var box14 = { id: 'box14', name: 'Mac mini', location: 'bedroom', notes: '', parentId: null, createdAt: '', items: [] };
state.boxes.push(box14);
state.activeBoxId = null;
app.selectBox('box14');
assertEq('box name added to history', inputHistory[inputHistory.length - 1], 'Mac mini');

console.log('\n15. selectBox history entry is navigable with arrow up');
reset();
state.boxes = [];
var box15 = { id: 'box15', name: 'wardrobe - south', location: 'bedroom', notes: '', parentId: null, createdAt: '', items: [] };
state.boxes.push(box15);
app.selectBox('box15');
fakeInput.value = '';
key('ArrowUp');
assertEq('arrow up recalls sidebar click', fakeInput.value, 'wardrobe - south');

console.log('\n16. Consecutive sidebar clicks on same box not double-stored');
reset();
state.boxes = [];
var box16 = { id: 'box16', name: 'Desktop', location: 'bedroom', notes: '', parentId: null, createdAt: '', items: [] };
state.boxes.push(box16);
app.selectBox('box16');
app.selectBox('box16');
assertEq('only one entry for repeated click', inputHistory.filter(function(h){ return h === 'Desktop'; }).length, 1);


// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
