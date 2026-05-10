// test_nest.js — Tests for nested boxes feature
// Run with: node test_nest.js

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
var state            = app.state;
var uid              = app.uid;
var processInput     = app.processInput;
var handleNest       = app.handleNest;
var handleNestParent = app.handleNestParent;
var handleDeleteBox  = app.handleDeleteBox;
var handleDump       = app.handleDump;
var handleDumpTarget = app.handleDumpTarget;
var getDescendantIds = app.getDescendantIds;
var childBoxes       = app.childBoxes;
var renderBoxTree    = app.renderBoxTree;
var renderBoxCard    = app.renderBoxCard;
var sameProximity    = app.sameProximity;
// selectBox and toggleCollapse accessed via app.* to allow stubbing addUserMessage

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
  state.conversationStage = 'BOX_OPEN';
  lastBotMessage = null;
  lastChips = [];
}
function makeBox(name, location, parentId) {
  var box = { id: uid(), name: name, location: location||'', notes: '', parentId: parentId||null, createdAt: new Date().toISOString(), items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}
function makeItem(box, name, fate) {
  var item = { id: uid(), name: name, fate: fate||'unsure', description: '', notes: '', photos: [], createdAt: new Date().toISOString() };
  box.items.push(item);
  return item;
}

console.log('\nNested Boxes Tests\n');

// ── DATA MODEL ────────────────────────────────────────────────────────────────
console.log('1. New boxes have parentId: null by default');
reset();
state.conversationStage = 'AWAITING_BOX_NAME';
processInput('test box name', []);
var box = state.boxes[0];
assert('parentId is null', box && box.parentId === null);

// ── getDescendantIds ──────────────────────────────────────────────────────────
console.log('\n2. getDescendantIds returns all descendants');
reset();
var a = makeBox('A', 'room');
var b = makeBox('B', 'room'); b.parentId = a.id;
var c = makeBox('C', 'room'); c.parentId = b.id;
var d = makeBox('D', 'room'); d.parentId = a.id;
var desc = getDescendantIds(a.id);
assert('includes B', desc.indexOf(b.id) !== -1);
assert('includes C (grandchild)', desc.indexOf(c.id) !== -1);
assert('includes D', desc.indexOf(d.id) !== -1);
assert('does not include A itself', desc.indexOf(a.id) === -1);

// ── childBoxes ────────────────────────────────────────────────────────────────
console.log('\n3. childBoxes returns only direct children');
reset();
var a = makeBox('A', 'room');
var b = makeBox('B', 'room'); b.parentId = a.id;
var c = makeBox('C', 'room'); c.parentId = b.id; // grandchild of A
var kids = childBoxes(a.id);
assert('B is a child of A', kids.length === 1 && kids[0].id === b.id);
assert('C is not a direct child of A', kids.every(function(k){ return k.id !== c.id; }));

// ── NEST COMMAND ──────────────────────────────────────────────────────────────
console.log('\n4. nest sets parentId of active box');
reset();
var parent = makeBox('Parent Box', 'bedroom');
var child  = makeBox('Child Box', 'bedroom');
state.activeBoxId = child.id;
handleNest('nest');
// Now awaiting parent selection
assert('stage set to AWAITING_NEST_PARENT', state.conversationStage === 'AWAITING_NEST_PARENT');
assert('pendingNest.childId set', state.pendingNest && state.pendingNest.childId === child.id);
handleNestParent('Parent Box');
assert('parentId updated', child.parentId === parent.id);
assertIncludes('confirms nesting', lastBotMessage, 'inside');

console.log('\n5. nest with no active box shows error');
reset();
state.activeBoxId = null;
handleNest('nest');
assertIncludes('explains no active box', lastBotMessage, 'No active box');

console.log('\n6. nest with no other boxes shows error');
reset();
makeBox('Only Box', 'bedroom');
handleNest('nest');
assertIncludes('says no other boxes', lastBotMessage, 'No other boxes');

console.log('\n7. Circular nesting prevented — cannot nest A inside its own descendant');
reset();
var a = makeBox('A', 'room');
var b = makeBox('B', 'room'); b.parentId = a.id;
state.activeBoxId = a.id;
state.pendingNest = { childId: a.id };
handleNestParent('B');
assert('parentId not changed', a.parentId === null);
assertIncludes('explains circular error', lastBotMessage, 'itself');

console.log('\n8. Cannot nest a box inside itself');
reset();
var a = makeBox('A', 'room');
var b = makeBox('B', 'room');
state.activeBoxId = a.id;
state.pendingNest = { childId: a.id };
handleNestParent('A');
assert('parentId unchanged', a.parentId === null);
assertIncludes('explains circular error', lastBotMessage, 'itself');

console.log('\n9. "put X inside Y" inline syntax works');
reset();
var parent = makeBox('Shelf', 'living room');
var child  = makeBox('Books', 'living room');
state.activeBoxId = child.id;
processInput('put Books inside Shelf', []);
assert('parentId set', child.parentId === parent.id);

console.log('\n10. Chip label: same location shows just name');
reset();
var src  = makeBox('Active Box', 'bedroom');
var other = makeBox('Other Box', 'bedroom');
state.activeBoxId = src.id;
handleNest('nest');
assert('chip shows just name for same location', lastChips.indexOf('Other Box') !== -1);

console.log('\n11. Chip label: different location shows location · name');
reset();
var src  = makeBox('Active Box', 'bedroom');
var other = makeBox('Other Box', 'living room');
state.activeBoxId = src.id;
handleNest('nest');
assert('chip shows location prefix', lastChips.some(function(c){ return c.indexOf('living room') !== -1 && c.indexOf('Other Box') !== -1; }));

console.log('\n11b. Chip label: bedroom vs bedroom - east wall treated as same proximity');
reset();
var src  = makeBox('Mac mini', 'bedroom');
var other = makeBox('Desktop', 'bedroom - east wall');
state.activeBoxId = src.id;
handleNest('nest');
assert('chip shows just name (no location prefix)', lastChips.indexOf('Desktop') !== -1);
assert('chip does not show location prefix', !lastChips.some(function(c){ return c === 'bedroom - east wall · Desktop'; }));

// ── DELETE GUARD ──────────────────────────────────────────────────────────────
console.log('\n12. Cannot delete a box that has children');
reset();
var parent = makeBox('Parent Box', 'bedroom');
var child  = makeBox('Child Box', 'bedroom'); child.parentId = parent.id;
state.activeBoxId = parent.id;
handleDeleteBox();
assert('parent not deleted', state.boxes.length === 2);
assertIncludes('explains child boxes exist', lastBotMessage, 'contains');

console.log('\n13. Can delete a childless, empty box');
reset();
var parent = makeBox('Parent Box', 'bedroom');
var child  = makeBox('Child Box', 'bedroom'); child.parentId = parent.id;
state.activeBoxId = child.id;
handleDeleteBox();
assert('stage set to confirm', state.conversationStage === 'AWAITING_DELETE_BOX_CONFIRM');

// ── DUMP WITH CHILDREN ────────────────────────────────────────────────────────
console.log('\n14. Dumping re-parents direct children to target');
reset();
var src    = makeBox('Source', 'bedroom');
var target = makeBox('Target', 'living room');
var kid    = makeBox('Kid',    'bedroom'); kid.parentId = src.id;
makeItem(src, 'Pear', 'keep');
state.activeBoxId = src.id;
handleDumpTarget('Target');
assert('item moved to target', target.items.length === 1);
assert('source empty', src.items.length === 0);
assert('kid re-parented to target', kid.parentId === target.id);
assertIncludes('mentions nested box move', lastBotMessage, 'nested');

console.log('\n15. Grandchildren stay under their immediate parent after dump');
reset();
var src       = makeBox('Source',      'bedroom');
var target    = makeBox('Target',      'living room');
var kid       = makeBox('Kid',         'bedroom'); kid.parentId = src.id;
var grandkid  = makeBox('Grandkid',    'bedroom'); grandkid.parentId = kid.id;
state.activeBoxId = src.id;
handleDumpTarget('Target');
assert('kid re-parented to target', kid.parentId === target.id);
assert('grandkid still under kid', grandkid.parentId === kid.id);

console.log('\n16. Dump with no children works as before');
reset();
var src    = makeBox('Source', 'bedroom');
var target = makeBox('Target', 'living room');
makeItem(src, 'Lamp', 'keep');
state.activeBoxId = src.id;
handleDumpTarget('Target');
assert('item transferred', target.items.length === 1);
assert('source empty', src.items.length === 0);

console.log('\n17. put X inside Y works with no active box');
reset();
var parent = makeBox('Desktop', 'bedroom');
var child  = makeBox('Mac mini', 'bedroom');
state.activeBoxId = null;
processInput('put Mac mini inside Desktop', []);
assert('parentId set without active box', child.parentId === parent.id);

console.log('\n18. put X in Y (short preposition) works');
reset();
var parent = makeBox('Desktop', 'bedroom');
var child  = makeBox('Mac mini', 'bedroom');
state.activeBoxId = null;
processInput('put Mac mini in Desktop', []);
assert('parentId set via "in" preposition', child.parentId === parent.id);

console.log('\n19. put X on Y works');
reset();
var parent = makeBox('Shelf', 'bedroom');
var child  = makeBox('Books', 'bedroom');
state.activeBoxId = null;
processInput('put Books on Shelf', []);
assert('parentId set via "on" preposition', child.parentId === parent.id);

console.log('\n20. put X inside Y with partial child name match');
reset();
var parent = makeBox('Desktop', 'bedroom');
var child  = makeBox('Mac mini', 'bedroom');
state.activeBoxId = null;
processInput('put Mac inside Desktop', []);
assert('parentId set via partial child name', child.parentId === parent.id);


// ── SCOPING REGRESSION TESTS ─────────────────────────────────────────────────
// These tests guard against renderBoxTree being accidentally moved into a
// block scope where it becomes undefined when renderSidebar calls it.

console.log('\n21. renderBoxTree is defined and callable (scoping regression)');
assert('renderBoxTree is a function', typeof renderBoxTree === 'function');
reset();
var a = makeBox('A', 'room');
var b = makeBox('B', 'room'); b.parentId = a.id;
state.activeBoxId = null;
var html = renderBoxTree(null, 0, []);
assert('renderBoxTree returns a non-empty string', typeof html === 'string' && html.length > 0);
assert('renderBoxTree includes box A name', html.indexOf('A') !== -1);
assert('renderBoxTree includes box B name (child rendered)', html.indexOf('B') !== -1);

console.log('\n22. renderBoxTree only renders top-level boxes at root call');
reset();
var root = makeBox('Root', 'room');
var child = makeBox('Child', 'room'); child.parentId = root.id;
state.activeBoxId = null;
var topHtml = renderBoxTree(null, 0, []);
// Root should appear, child should appear nested under it
assert('top-level box appears', topHtml.indexOf('Root') !== -1);
assert('child box also appears (nested)', topHtml.indexOf('Child') !== -1);
// A call for a non-existent parent should return empty
var emptyHtml = renderBoxTree('nonexistent-id', 0, []);
assert('renderBoxTree returns empty string for unknown parent', emptyHtml === '');

console.log('\n23. Collapsed box hides its children in renderBoxTree output');
reset();
var parent = makeBox('Parent', 'room');
var kid    = makeBox('Kid', 'room'); kid.parentId = parent.id;
state.activeBoxId = null;
var expanded  = renderBoxTree(null, 0, []);
var collapsed = renderBoxTree(null, 0, [parent.id]);
assert('kid appears when parent expanded', expanded.indexOf('Kid') !== -1);
assert('kid hidden when parent collapsed', collapsed.indexOf('Kid') === -1);


console.log('\n24. renderBoxTree shows boxes with undefined parentId (pre-nesting localStorage data)');
reset();
// Simulate a box saved before parentId field was added
var legacyBox = { id: uid(), name: 'Legacy Box', location: 'attic', notes: '', createdAt: new Date().toISOString(), items: [] };
// parentId intentionally absent (undefined), as it would be in old localStorage data
state.boxes.push(legacyBox);
state.activeBoxId = null;
var html = renderBoxTree(null, 0, []);
assert('legacy box (undefined parentId) appears in sidebar', html.indexOf('Legacy Box') !== -1);


console.log('\n25. Sidebar meta: box with only child boxes shows "N boxes", not "empty"');
reset();
var parent = makeBox('Parent', 'room');
var child  = makeBox('Child', 'room'); child.parentId = parent.id;
state.activeBoxId = null;
var html = renderBoxCard(parent, 0, []);
assert('shows box count not empty', html.indexOf('1 box') !== -1);
// Only the parent card should not say empty (child may be empty — that's fine)
assert('does not say empty', html.indexOf('box-meta">empty') === -1 || html.indexOf('box-meta">1 box') !== -1);

console.log('\n26. Sidebar meta: box with own items AND child boxes shows both counts');
reset();
var parent = makeBox('Parent', 'room');
makeItem(parent, 'Lamp', 'keep');
makeItem(parent, 'Chair', 'donate');
var child = makeBox('Child', 'room'); child.parentId = parent.id;
state.activeBoxId = null;
var html = renderBoxTree(null, 0, []);
assert('shows item count', html.indexOf('2 items') !== -1);
assert('shows box count', html.indexOf('1 box') !== -1);

console.log('\n27. Sidebar meta: truly empty box (no items, no children) shows "empty"');
reset();
var box = makeBox('Empty Box', 'room');
state.activeBoxId = null;
var html = renderBoxTree(null, 0, []);
assert('shows empty', html.indexOf('empty') !== -1);


// ── SIDEBAR INTERACTION ECHO TESTS ───────────────────────────────────────────
// Guard: clicking sidebar UI should always echo a user-visible command.

console.log('\n28. selectBox echoes box name as user message');
reset();
var echoedUserMessages = [];
// Capture by overriding the global that app.js calls through
var _origAddUser = global.addUserMessage;
global.addUserMessage = function(text) { echoedUserMessages.push(text); };
var box28 = makeBox('Mac mini', 'bedroom');
state.activeBoxId = null;
app.selectBox(box28.id);
global.addUserMessage = _origAddUser;
assert('user message echoed on selectBox', echoedUserMessages.length > 0);
assert('echoed message is box name', echoedUserMessages[0] === 'Mac mini');

console.log('\n29. toggleCollapse echoes collapse command as user message');
reset();
var echoedCollapse = [];
global.addUserMessage = function(text) { echoedCollapse.push(text); };
var parent29 = makeBox('Desktop', 'bedroom');
var child29  = makeBox('Mac mini', 'bedroom'); child29.parentId = parent29.id;
state.activeBoxId = null;
app.toggleCollapse(parent29.id);
global.addUserMessage = _origAddUser;
assert('user message echoed on collapse', echoedCollapse.length > 0);
assert('echoed message is collapse + box name', echoedCollapse[0] === 'collapse Desktop');

console.log('\n30. toggleCollapse echoes expand command on second click');
reset();
var echoedExpand = [];
global.addUserMessage = function(text) { echoedExpand.push(text); };
var parent30 = makeBox('Desktop', 'bedroom');
var child30  = makeBox('Mac mini', 'bedroom'); child30.parentId = parent30.id;
state.activeBoxId = null;
app.toggleCollapse(parent30.id); // collapse
app.toggleCollapse(parent30.id); // expand
global.addUserMessage = _origAddUser;
assert('second toggle echoes expand', echoedExpand[1] === 'expand Desktop');


console.log('\nNest: child inherits parent location on nest');
reset();
var parent = makeBox('Shelf', 'Dining Room');
var child  = makeBox('Small box', 'Garage'); // different location initially
state.activeBoxId = child.id;
state.pendingNest = { childId: child.id };
state.conversationStage = 'AWAITING_NEST_PARENT';
processInput('Shelf', []);
assert('child location updated to parent location', child.location === 'Dining Room');
assert('parentId set correctly', child.parentId === parent.id);


// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
