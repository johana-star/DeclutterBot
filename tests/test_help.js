// test_help.js — Tests for hi/help/? commands
// Run with: node tests/test_help.js

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
global.document = {
  getElementById: function() { return { innerHTML: '', value: '', style: {}, scrollTop: 0, textContent: '' }; },
  createElement:  function() { return { className: '', innerHTML: '', appendChild: function(){}, style: {} }; }
};

var app         = require('../app.js');
var state       = app.state;
var uid         = app.uid;
var processInput = app.processInput;
var handleHelp  = app.handleHelp;

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
  state.conversationHistory = [];
  lastBotMessage = null;
  lastChips = [];
}
function makeBox(name) {
  var box = { id: uid(), name: name, location: 'bedroom', notes: '', parentId: null, createdAt: '', items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}

console.log('\nHelp Command Tests\n');

// 1. "hi" triggers help with no boxes → prompts for first box
console.log('1. "hi" with no boxes prompts for first box name');
reset();
processInput('hi', []);
assertIncludes('mentions DeclutterBot', lastBotMessage, 'DeclutterBot');
assert('stage set to AWAITING_BOX_NAME', state.conversationStage === 'AWAITING_BOX_NAME');
assert('Start sorting chip shown', lastChips.indexOf('Start sorting') !== -1);

// 2. "help" with boxes shows command list
console.log('\n2. "help" with boxes shows command reference');
reset();
makeBox('Test Box');
processInput('help', []);
assertIncludes('mentions new box command', lastBotMessage, 'New box');
assertIncludes('mentions review items', lastBotMessage, 'Review items');
assertIncludes('mentions move', lastBotMessage, 'Move');
assertIncludes('mentions import', lastBotMessage, 'Import');

// 3. "?" works the same as help
console.log('\n3. "?" triggers help');
reset();
makeBox('Test Box');
processInput('?', []);
assertIncludes('shows command list', lastBotMessage, 'New box');

// 4. "hello" works
console.log('\n4. "hello" triggers help');
reset();
processInput('hello', []);
assert('responded to hello', lastBotMessage !== null);

// 5. "hey" works
console.log('\n5. "hey" triggers help');
reset();
processInput('hey', []);
assert('responded to hey', lastBotMessage !== null);

// 6. Help works from BOX_OPEN stage (was previously broken)
console.log('\n6. "help" works from BOX_OPEN stage without logging as item');
reset();
makeBox('Test Box');
state.conversationStage = 'BOX_OPEN';
processInput('help', []);
assert('no item added to box', state.boxes[0].items.length === 0);
assertIncludes('shows help not item prompt', lastBotMessage, 'New box');

// 7. Help from BOX_OPEN shows box open chips
console.log('\n7. "help" from active box shows box-context chips');
reset();
makeBox('Test Box');
state.conversationStage = 'BOX_OPEN';
processInput('help', []);
assert('shows Add item chip', lastChips.indexOf('Add item') !== -1);

// 8. Help with no active box shows FINISHED chips
console.log('\n8. "help" with boxes but no active box shows navigation chips');
reset();
makeBox('Test Box');
state.activeBoxId = null;
state.conversationStage = 'FINISHED';
handleHelp();
assert('shows New box chip', lastChips.indexOf('New box') !== -1);
assert('shows Continue last box chip', lastChips.indexOf('Continue last box') !== -1);
assert('stage set to FINISHED', state.conversationStage === 'FINISHED');

// 9. Help mentions arrow key navigation
console.log('\n9. Help message mentions arrow key navigation');
reset();
makeBox('Test Box');
processInput('help', []);
assertIncludes('mentions arrow keys', lastBotMessage, 'arrow');

// 10. "h" works as shorthand for help
console.log('\n10. "h" triggers help');
reset();
makeBox('Test Box');
processInput('h', []);
assert('h not logged as item', state.boxes[0].items.length === 0);
assertIncludes('shows help message', lastBotMessage, 'New box');


console.log('\n11. "add item" with no active box shows error, not item prompt');
reset();
state.conversationStage = 'FINISHED';
processInput('add item', []);
assertIncludes('explains no active box', lastBotMessage, 'No active box');
assert('stage not set to BOX_OPEN', state.conversationStage !== 'BOX_OPEN');

console.log('\n12. "add item" with active box prompts for item name');
reset();
makeBox('Test Box');
processInput('add item', []);
assert('stage set to BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assertIncludes('asks for item', lastBotMessage, 'item');


// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
