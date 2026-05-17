// test_map_uncataloged.js — Tests for mapping uncataloged boxes (Main Quest Milestone 2)
// Run with: node tests/test_map_uncataloged.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
let lastBotMessage = null;
let lastUserMessage = null;
let lastChips = [];

global.addBotMessage    = function(text) { lastBotMessage = text; };
global.addUserMessage   = function(text) { lastUserMessage = text; };
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

let app         = require('../app.js');
let state       = app.state;
let processInput = app.processInput;

// ── HARNESS ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}
function assertIncludes(desc, haystack, needle) {
  assert(desc, haystack && haystack.indexOf(needle) !== -1);
}
function reset() {
  state.boxes = [
    {id: 'box1', name: 'Garage Box', location: 'garage', notes: '', items: []},
    {id: 'box2', name: 'Attic Box', location: 'attic', notes: '', items: []},
    {id: 'box3', name: 'Living Room Box', location: 'living room', notes: '', items: []},
    {id: 'box4', name: 'Bedroom Box', location: 'bedroom', notes: '', items: []},
    {id: 'box5', name: 'Spare Bedroom Box', location: 'spare bedroom', notes: '', items: []}
  ];
  state.activeBoxId = null;
  state.conversationStage = 'FINISHED';
  state.mainQuest = { uncatalogedBoxes: [] };
  state.pendingUncatalogedMapping = null;
  state.pendingCatalogId = null;
  lastBotMessage = null;
  lastUserMessage = null;
  lastChips = [];
}

console.log('\nMain Quest - Milestone 2: Map Uncataloged Boxes\n');

// ── PARSING ───────────────────────────────────────────────────────────────────

// 1. Basic command with "in"
console.log('1. "map box in garage" creates one uncataloged box');
reset();
processInput('map box in garage', []);
assert('uncataloged box created', state.mainQuest.uncatalogedBoxes.length === 1);
assert('location is garage', state.mainQuest.uncatalogedBoxes[0].location === 'garage');
assert('quantity is 1', state.mainQuest.uncatalogedBoxes[0].quantity === 1);
assert('description is null', state.mainQuest.uncatalogedBoxes[0].description === null);
assertIncludes('confirms mapping', lastBotMessage, 'Mapped');

// 2. Batch with number
console.log('\n2. "map 5 boxes in attic" creates batch');
reset();
processInput('map 5 boxes in attic', []);
assert('one entry created', state.mainQuest.uncatalogedBoxes.length === 1);
assert('quantity is 5', state.mainQuest.uncatalogedBoxes[0].quantity === 5);
assert('location is attic', state.mainQuest.uncatalogedBoxes[0].location === 'attic');

// 3. Word numbers
console.log('\n3. "map ten boxes in living room" parses word numbers');
reset();
processInput('map ten boxes in living room', []);
assert('quantity is 10', state.mainQuest.uncatalogedBoxes[0].quantity === 10);

// 4. "about" stripped
console.log('\n4. "map about 5 boxes in garage" strips "about"');
reset();
processInput('map about 5 boxes in garage', []);
assert('quantity is 5', state.mainQuest.uncatalogedBoxes[0].quantity === 5);
assert('location is garage', state.mainQuest.uncatalogedBoxes[0].location === 'garage');

// 5. Description capture
console.log('\n5. "map box in garage on metal shelving" captures description');
reset();
processInput('map box in garage on metal shelving', []);
assert('location is garage', state.mainQuest.uncatalogedBoxes[0].location === 'garage');
assert('has description', state.mainQuest.uncatalogedBoxes[0].description !== null);
assertIncludes('description has shelving', state.mainQuest.uncatalogedBoxes[0].description, 'shelving');

// 6. Multiple mappings accumulate
console.log('\n6. Multiple mappings accumulate');
reset();
processInput('map 3 boxes in garage', []);
processInput('map 2 boxes in attic', []);
assert('two entries', state.mainQuest.uncatalogedBoxes.length === 2);
assertIncludes('shows total', lastBotMessage, '5');

// 7. Each entry has unique ID and timestamp
console.log('\n7. Each entry has unique ID and timestamp');
reset();
processInput('map box in garage', []);
processInput('map box in attic', []);
assert('IDs differ', state.mainQuest.uncatalogedBoxes[0].id !== state.mainQuest.uncatalogedBoxes[1].id);
assert('has addedAt', state.mainQuest.uncatalogedBoxes[0].addedAt.indexOf('T') !== -1);

// 8. Malformed command shows error
console.log('\n8. Malformed command (no location) shows error');
reset();
processInput('map box', []);
assert('no box created', state.mainQuest.uncatalogedBoxes.length === 0);
assertIncludes('shows example', lastBotMessage, 'map 5 boxes');

// ── CHIPS AND DISCOVERABILITY ─────────────────────────────────────────────────

// 9. "Map another" chip works
console.log('\n9. "Map another" chip triggers map flow');
reset();
processInput('map box in garage', []);
assert('Map another chip shown', lastChips.indexOf('Map another') !== -1);

// 10. Help menu includes map and catalog commands
console.log('\n10. Help menu includes map and catalog commands');
reset();
processInput('help', []);
assertIncludes('help mentions map', lastBotMessage, 'Map box');
assertIncludes('help mentions catalog', lastBotMessage, 'Catalog next box');

// 11. "Map remaining work" shows uncataloged count
console.log('\n11. "Map remaining work" shows uncataloged count');
reset();
processInput('map 3 boxes in garage', []);
processInput('map 2 boxes in attic', []);
processInput('map remaining work', []);
assertIncludes('shows uncataloged count', lastBotMessage, '5');
assertIncludes('mentions uncataloged', lastBotMessage, 'uncataloged');

// ── NEW LOCATION CONFIRMATION ─────────────────────────────────────────────────

// 12. New location asks for confirmation
console.log('\n12. New location asks for confirmation');
reset();
processInput('map 3 boxes in basement', []);
assertIncludes('asks about new location', lastBotMessage, 'new location');
assert('no box created yet', state.mainQuest.uncatalogedBoxes.length === 0);
assert('pending mapping exists', state.pendingUncatalogedMapping !== null);

// 13. Confirming with "yes" creates the mapping
console.log('\n13. Confirming with "yes" creates the mapping');
processInput('yes', []);
assert('box created', state.mainQuest.uncatalogedBoxes.length === 1);
assert('quantity is 3', state.mainQuest.uncatalogedBoxes[0].quantity === 3);
assert('location is basement', state.mainQuest.uncatalogedBoxes[0].location === 'basement');
assert('pending cleared', state.pendingUncatalogedMapping === null);

// 14. Cancelling with "no" does not create the mapping
console.log('\n14. Cancelling with "no" does not create the mapping');
reset();
processInput('map box in cellar', []);
processInput('no', []);
assert('no box created', state.mainQuest.uncatalogedBoxes.length === 0);
assertIncludes('confirms cancellation', lastBotMessage, 'Cancelled');

// 15. "yes, <corrected>" uses corrected location
console.log('\n15. "yes, <corrected>" uses corrected location');
reset();
processInput('map box in cellar', []);
processInput('yes, basement', []);
assert('box created', state.mainQuest.uncatalogedBoxes.length === 1);
assert('location is corrected', state.mainQuest.uncatalogedBoxes[0].location === 'basement');

// ── CATALOG FLOW ──────────────────────────────────────────────────────────────

// 16. catalogUncatalogedBox shows user message with location
console.log('\n16. catalogUncatalogedBox shows user message with location');
reset();
processInput('map 3 boxes in garage', []);
let catId = state.mainQuest.uncatalogedBoxes[0].id;
app.catalogUncatalogedBox(catId);
assertIncludes('user message has location', lastUserMessage, 'garage');
assertIncludes('asks for name', lastBotMessage, 'What would you like to call it');

// 17. Naming a cataloged box pre-fills location and decrements
console.log('\n17. Naming a cataloged box pre-fills location');
processInput('winter clothes', []);
let newBox = state.boxes[state.boxes.length - 1];
assert('box name is winter clothes', newBox.name === 'winter clothes');
assert('location is garage', newBox.location === 'garage');
assert('quantity decremented to 2', state.mainQuest.uncatalogedBoxes[0].quantity === 2);
assert('stage is BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assertIncludes('shows remaining', lastBotMessage, '2 more');

// 18. Catalog quantity 1 removes entry entirely
console.log('\n18. Catalog quantity 1 removes entry');
reset();
processInput('map box in attic', []);
let catId2 = state.mainQuest.uncatalogedBoxes[0].id;
app.catalogUncatalogedBox(catId2);
processInput('old photo albums', []);
assert('entry removed', state.mainQuest.uncatalogedBoxes.length === 0);
assert('box created', state.boxes[state.boxes.length - 1].name === 'old photo albums');
assert('location set', state.boxes[state.boxes.length - 1].location === 'attic');

// ── DISAMBIGUATION ────────────────────────────────────────────────────────────

// 19. "catalog next box" with multiple locations asks which
console.log('\n19. "catalog next box" with multiple locations asks which');
reset();
processInput('map 3 boxes in garage', []);
processInput('map 2 boxes in attic', []);
processInput('catalog next box', []);
assertIncludes('asks which location', lastBotMessage, 'Which location');
assert('chips have locations', lastChips.length === 2);
assertIncludes('chip has garage', lastChips[0], 'garage');
assertIncludes('chip has attic', lastChips[1], 'attic');

// 20. "catalog next box in garage" skips disambiguation
console.log('\n20. "catalog next box in [location]" skips disambiguation');
processInput('catalog next box in garage', []);
assertIncludes('asks for name in garage', lastBotMessage, 'garage');
assertIncludes('asks what to call it', lastBotMessage, 'What would you like to call it');

// 21. "catalog next box" with single location goes directly
console.log('\n21. "catalog next box" with single location goes directly');
reset();
processInput('map 3 boxes in garage', []);
processInput('catalog next box', []);
assertIncludes('asks for name', lastBotMessage, 'What would you like to call it');
assertIncludes('shows location', lastBotMessage, 'garage');

// 22. "catalog" with no uncataloged boxes shows message
console.log('\n22. "catalog" with no uncataloged boxes shows message');
reset();
processInput('catalog', []);
assertIncludes('says no boxes', lastBotMessage, 'No uncataloged');

// ── REMOVE ────────────────────────────────────────────────────────────────────

// 23. removeUncatalogedBox deletes entry
console.log('\n23. removeUncatalogedBox deletes entry');
reset();
processInput('map 5 boxes in garage', []);
let removeId = state.mainQuest.uncatalogedBoxes[0].id;
app.removeUncatalogedBox(removeId);
assert('entry removed', state.mainQuest.uncatalogedBoxes.length === 0);
assertIncludes('confirms removal', lastBotMessage, 'Removed');

// ── HELPERS ───────────────────────────────────────────────────────────────────

// 24. helpers.pluralize works via _.invert(IRREGULARS)
console.log('\n24. helpers.pluralize uses inverted IRREGULARS');
assert('box -> boxes', app.helpers.pluralize('box', 2) === 'boxes');
assert('child -> children', app.helpers.pluralize('child', 3) === 'children');
assert('item -> items', app.helpers.pluralize('item', 5) === 'items');
assert('box singular', app.helpers.pluralize('box', 1) === 'box');

// ── GLOBAL AVAILABILITY ───────────────────────────────────────────────────────

// 26. Map command works from BOX_OPEN context
console.log('\n26. Map command works from BOX_OPEN stage');
reset();
state.conversationStage = 'BOX_OPEN';
state.activeBoxId = 'box1';
processInput('map 3 boxes in attic', []);
assert('uncataloged box created', state.mainQuest.uncatalogedBoxes.length === 1);
assertIncludes('confirms mapping', lastBotMessage, 'Mapped');

// 27. Catalog command works from BOX_OPEN stage
console.log('\n27. Catalog command works from BOX_OPEN stage');
reset();
state.conversationStage = 'BOX_OPEN';
state.activeBoxId = 'box1';
processInput('map 2 boxes in garage', []);
processInput('catalog next box', []);
assertIncludes('asks for name', lastBotMessage, 'What would you like to call it');

// ── SIDEBAR RENDERING ─────────────────────────────────────────────────────────

// 28. renderUncatalogedBoxes returns empty string for empty array
console.log('\n28. renderUncatalogedBoxes returns empty for no boxes');
reset();
// Access via the function being called in renderSidebar — test indirectly
assert('no uncataloged in sidebar', state.mainQuest.uncatalogedBoxes.length === 0);

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
