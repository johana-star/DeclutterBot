// test_promote_location.js — Tests for promote location to box feature
// Run from project root: node tests/test_promote_location.js

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
var effectiveLocation    = app.effectiveLocation;
var promoteLocationToBox = app.promoteLocationToBox;
var handlePromoteLocation = app.handlePromoteLocation;

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
  state.pendingPromoteLocation = null;
  state.conversationStage = 'BOX_OPEN';
  lastBotMessage = null;
  lastChips = [];
}

function makeBox(id, name, location, parentId) {
  var box = { id: id, name: name, location: location || null, parentId: parentId || null,
              notes: '', createdAt: '', fate: null, items: [] };
  state.boxes.push(box);
  return box;
}

console.log('\neffectiveLocation tests\n');

console.log('1. Box with location returns its own location');
reset();
var b = makeBox('b1', 'shelf', 'garage');
assert('own location', effectiveLocation(b) === 'garage');

console.log('\n2. Box with null location inherits from parent');
reset();
var parent = makeBox('p', 'closet', 'bedroom');
var child  = makeBox('c', 'shelf', null, 'p');
assert('inherits from parent', effectiveLocation(child) === 'bedroom');

console.log('\n3. Three levels deep — inherits from grandparent');
reset();
var gp    = makeBox('gp', 'room',   'apartment');
var par   = makeBox('pa', 'closet', null, 'gp');
var grand = makeBox('gc', 'shelf',  null, 'pa');
assert('inherits from grandparent', effectiveLocation(grand) === 'apartment');

console.log('\n4. Null box returns null');
assert('null box', effectiveLocation(null) === null);

console.log('\n5. Top-level box with no location returns null');
reset();
var orphan = makeBox('o', 'box', null);
assert('no location returns null', effectiveLocation(orphan) === null);

console.log('\npromoteLocationToBox tests\n');

console.log('6. Reparents all boxes with matching location');
reset();
var target = makeBox('t', 'leftmost closet', 'bedroom');
var gb = makeBox('gb', 'green box', 'leftmost closet');
var wb = makeBox('wb', 'white box', 'leftmost closet');
promoteLocationToBox('leftmost closet', target);
assert('gb reparented', gb.parentId === 't');
assert('wb reparented', wb.parentId === 't');
assert('gb location null', gb.location === null);
assert('wb location null', wb.location === null);
assert('target unaffected', target.location === 'bedroom');

console.log('\n7. effectiveLocation of reparented box is bedroom');
assert('inherited location', effectiveLocation(gb) === 'bedroom');

console.log('\n8. Summary message mentions count and target name');
reset();
var t2 = makeBox('t2', 'garage', 'backyard');
makeBox('b1', 'bikes',  'garage');
makeBox('b2', 'tools',  'garage');
makeBox('b3', 'kayak',  'garage');
promoteLocationToBox('garage', t2);
assert('message has count', lastBotMessage.includes('3 boxes'));
assert('message has target name', lastBotMessage.includes('garage'));

console.log('\n9. No matching location shows error');
reset();
var t3 = makeBox('t3', 'box', 'somewhere');
promoteLocationToBox('nonexistent location', t3);
assert('error message', lastBotMessage.includes('No boxes found'));

console.log('\n10. Already-nested box is still moved');
reset();
var t4 = makeBox('t4', 'closet', 'bedroom');
var outer = makeBox('o1', 'outer box', 'study');
var inner = makeBox('i1', 'inner box', 'study', 'o1'); // already nested
promoteLocationToBox('study', t4);
assert('outer reparented', outer.parentId === 't4');
assert('inner reparented', inner.parentId === 't4');
assert('outer location null', outer.location === null);
assert('inner location null', inner.location === null);

console.log('\nhandlePromoteLocation tests\n');

console.log('11. convert location uses existing matching box');
reset();
var lc = makeBox('lc', 'leftmost closet', 'bedroom');
var gb2 = makeBox('gb2', 'green box', 'leftmost closet');
handlePromoteLocation('convert location leftmost closet');
assert('gb2 reparented to lc', gb2.parentId === 'lc');
assert('success message', lastBotMessage.includes('leftmost closet'));

console.log('\n12. convert location to box syntax accepted');
reset();
var lc2 = makeBox('lc2', 'leftmost closet', 'bedroom');
var gb3 = makeBox('gb3', 'green box', 'leftmost closet');
handlePromoteLocation('convert location leftmost closet to box');
assert('to box suffix stripped', gb3.parentId === 'lc2');

console.log('\n13. nest <name> in <location> creates box with given location');
reset();
makeBox('s1', 'shelf A', 'garage');
makeBox('s2', 'shelf B', 'garage');
handlePromoteLocation('nest garage in backyard');
var newBox = state.boxes.find(function(b) { return b.name === 'garage'; });
assert('new box created', !!newBox);
assert('new box location', newBox && newBox.location === 'backyard');
assert('s1 reparented', state.boxes.find(function(b){ return b.name==='shelf A'; }).parentId === newBox.id);

console.log('\n14. No matching location shows helpful error');
reset();
makeBox('x1', 'box', 'somewhere');
handlePromoteLocation('convert location does not exist');
assert('error shown', lastBotMessage.includes('No boxes found'));

console.log('\n15. No location name shows usage hint');
reset();
handlePromoteLocation('convert location ');
assert('usage hint shown', !!lastBotMessage);


console.log('\n--- Regression tests ---');

console.log('\n16. Regression: convert location X to box routes correctly when name matches existing box');
reset();
var lcReg = makeBox('lc-r', 'leftmost closet', 'bedroom');
var gbReg = makeBox('gb-r', 'green box', 'leftmost closet');
var wbReg = makeBox('wb-r', 'white box', 'leftmost closet');
// This was silently dropping with ReferenceError: text is not defined
app.processInput('convert location leftmost closet to box');
assert('gb reparented (to box suffix)', gbReg.parentId === 'lc-r');
assert('wb reparented (to box suffix)', wbReg.parentId === 'lc-r');
assert('gb location null', gbReg.location === null);
assert('no error in message', lastBotMessage && lastBotMessage.includes('leftmost closet'));

console.log('\n17. Regression: ambiguous name (location + box) resolves to existing box, no clarification prompt');
reset();
var lcAmb = makeBox('lc-a', 'leftmost closet', 'bedroom');
var gbAmb = makeBox('gb-a', 'green box', 'leftmost closet');
// This was showing an ambiguity message and dropping the operation
app.processInput('convert location leftmost closet');
assert('promoted into existing box', gbAmb.parentId === 'lc-a');
assert('location set to null', gbAmb.location === null);
assert('success message not ambiguity message', lastBotMessage && !lastBotMessage.includes('Did you mean'));

console.log('\n18. Regression: nest X in Y resolves correctly when X is both location and box');
reset();
var lcNest = makeBox('lc-n', 'leftmost closet', 'bedroom');
var gbNest = makeBox('gb-n', 'green box', 'leftmost closet');
app.processInput('Nest leftmost closet in bedroom');
assert('promoted into existing box via nest', gbNest.parentId === 'lc-n');
assert('no ambiguity message', lastBotMessage && !lastBotMessage.includes('Did you mean'));

console.log('\n\u2500'.repeat(40));
console.log((failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
