// test_box_batch.js — Tests for batch box creation and singularizer
// Run with: node test_box_batch.js

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

var app = require('../app.js');
var state               = app.state;
var uid                 = app.uid;
var LETTERS             = app.LETTERS;
var processInput        = app.processInput;
var singularize         = app.singularize;
var singularizeLast     = app.singularizeLast;
var handleBoxBatchConfirm   = app.handleBoxBatchConfirm;
var handleBoxBatchLocation  = app.handleBoxBatchLocation;

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
  state.conversationStage = 'AWAITING_BOX_NAME';
  lastBotMessage = null;
  lastChips = [];
}

// ── SINGULARIZER TESTS ────────────────────────────────────────────────────────
console.log('\nSingularizer Tests\n');

console.log('1. Common suffix rules');
assert('boxes -> box',   singularize('boxes')   === 'box');
assert('rolls -> roll',  singularize('rolls')   === 'roll');
assert('bags -> bag',    singularize('bags')    === 'bag');
assert('bins -> bin',    singularize('bins')    === 'bin');
assert('dishes -> dish', singularize('dishes')  === 'dish');
assert('berries -> berry', singularize('berries') === 'berry');

console.log('\n2. Explicit irregular plurals');
assert('shelves -> shelf',   singularize('shelves')  === 'shelf');
assert('knives -> knife',    singularize('knives')   === 'knife');
assert('leaves -> leaf',     singularize('leaves')   === 'leaf');
assert('wives -> wife',      singularize('wives')    === 'wife');
assert('children -> child',  singularize('children') === 'child');
assert('feet -> foot',       singularize('feet')     === 'foot');
assert('teeth -> tooth',     singularize('teeth')    === 'tooth');
assert('men -> man',         singularize('men')      === 'man');
assert('women -> woman',     singularize('women')    === 'woman');
assert('mice -> mouse',      singularize('mice')     === 'mouse');

console.log('\n3. Invariant words left unchanged');
assert('box unchanged',       singularize('box')       === 'box');
assert('shelf unchanged',     singularize('shelf')     === 'shelf');
assert('scissors unchanged',  singularize('scissors')  === 'scissors');
assert('series unchanged',    singularize('series')    === 'series');

console.log('\n4. singularizeLast handles multi-word phrases');
assert('wooden boxes -> wooden box', singularizeLast('wooden boxes') === 'wooden box');
assert('storage shelves -> storage shelf', singularizeLast('storage shelves') === 'storage shelf');
assert('garage bins -> garage bin', singularizeLast('garage bins') === 'garage bin');

// ── BATCH BOX CREATION TESTS ──────────────────────────────────────────────────
console.log('\nBatch Box Creation Tests\n');

console.log('5. Word-number triggers batch confirm');
reset();
processInput('five wooden boxes', []);
assert('stage set to AWAITING_BOX_BATCH_CONFIRM', state.conversationStage === 'AWAITING_BOX_BATCH_CONFIRM');
assert('pendingBoxBatch qty is 5', state.pendingBoxBatch && state.pendingBoxBatch.qty === 5);
assert('baseName singularized', state.pendingBoxBatch && state.pendingBoxBatch.baseName === 'wooden box');
assertIncludes('confirms A through E', lastBotMessage, 'wooden box A');
assertIncludes('confirms last letter', lastBotMessage, 'wooden box E');

console.log('\n6. Digit number triggers batch confirm');
reset();
processInput('3 shelves', []);
assert('stage set to AWAITING_BOX_BATCH_CONFIRM', state.conversationStage === 'AWAITING_BOX_BATCH_CONFIRM');
assert('baseName is shelf', state.pendingBoxBatch && state.pendingBoxBatch.baseName === 'shelf');

console.log('\n7. Confirming batch creates correct number of boxes');
reset();
processInput('four storage bins', []);
handleBoxBatchConfirm('yes');
// Now in AWAITING_BOX_BATCH_LOCATION — provide location
processInput('garage', []);
assert('4 boxes created', state.boxes.length === 4);
assert('first box named correctly', state.boxes[0].name === 'storage bin A');
assert('last box named correctly', state.boxes[3].name === 'storage bin D');
assert('all share same location', state.boxes.every(function(b){ return b.location === 'garage'; }));
assert('active box is first', state.activeBoxId === state.boxes[0].id);

console.log('\n8. Boxes named with letters A-Z');
reset();
processInput('three rolls', []);
handleBoxBatchConfirm('yes');
processInput('kitchen', []);
assert('roll A exists', state.boxes[0].name === 'roll A');
assert('roll B exists', state.boxes[1].name === 'roll B');
assert('roll C exists', state.boxes[2].name === 'roll C');

console.log('\n9. "No, just 1" creates single box with singular name');
reset();
processInput('five wooden boxes', []);
handleBoxBatchConfirm('no');
assert('no batch boxes created yet', state.boxes.length === 1); // single box created, awaiting location
assert('stage is AWAITING_LOCATION', state.conversationStage === 'AWAITING_LOCATION');
processInput('bedroom', []);
assert('box created', state.boxes.length === 1);
assert('singular name used', state.boxes[0].name === 'wooden box');

console.log('\n10. shelves -> shelf batch (the real-world use case)');
reset();
processInput('six shelves', []);
assert('detected as batch', state.conversationStage === 'AWAITING_BOX_BATCH_CONFIRM');
assert('baseName is shelf', state.pendingBoxBatch.baseName === 'shelf');
handleBoxBatchConfirm('yes');
processInput('living room bookshelf', []);
assert('6 shelf boxes created', state.boxes.length === 6);
assert('shelf A', state.boxes[0].name === 'shelf A');
assert('shelf F', state.boxes[5].name === 'shelf F');
assert('all in living room bookshelf', state.boxes.every(function(b){ return b.location === 'living room bookshelf'; }));

console.log('\n11. Single box name not triggered for qty of 1');
reset();
processInput('one box', []);
// "one" maps to 1 so should NOT trigger batch
assert('no batch pending', !state.pendingBoxBatch);

console.log('\n12. Batch capped at 26 (alphabet limit)');
reset();
processInput('30 boxes', []);
// qty 30 > 26, should fall through to single box name
assert('no batch for qty over 26', !state.pendingBoxBatch);

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
