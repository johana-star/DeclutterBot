// test_progress_bar.js — Tests for progress bar (Main Quest Milestone 4)
// Run with: node tests/test_progress_bar.js

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

let app = require('../app.js');
let state = app.state;
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
function assertNotIncludes(desc, haystack, needle) {
  assert(desc, !haystack || haystack.indexOf(needle) === -1);
}
function makeBox(name, location, itemCount) {
  let items = [];
  for (let i = 0; i < itemCount; i++) {
    items.push({ id: app.uid(), name: `item ${i+1}`, fate: 'keep', notes: '', deleted_at: null, createdAt: new Date().toISOString() });
  }
  return { id: app.uid(), name, location, notes: '', items, parentId: null, createdAt: new Date().toISOString() };
}
function reset() {
  state.boxes = [
    makeBox('Kitchen Box', 'kitchen', 10),
    makeBox('Bedroom Box', 'bedroom', 8),
    makeBox('Garage Box', 'garage', 12),
    makeBox('Attic Box', 'attic', 5)
  ];
  state.activeBoxId = null;
  state.conversationStage = 'FINISHED';
  state.mainQuest = {
    uncatalogedBoxes: [],
    completionEstimate: null,
    completedLocations: [],
    calibratedAt: null
  };
  state.pendingUncatalogedMapping = null;
  state.pendingCatalogId = null;
  state._previousStage = null;
  lastBotMessage = null;
  lastUserMessage = null;
  lastChips = [];
}

console.log('\nMain Quest - Milestone 4: Progress Bar\n');

// ── UNLOCKING ─────────────────────────────────────────────────────────────────

// 1. Progress bar not shown before calibration
console.log('1. Progress bar not shown before calibration');
reset();
processInput('show progress', []);
assertNotIncludes('no progress bar', lastBotMessage, '[');
assertNotIncludes('no percentage', lastBotMessage, '%');
assertIncludes('shows basic stats', lastBotMessage, 'cataloged');

// 2. Progress bar appears after calibration
console.log('\n2. Progress bar appears after calibration');
reset();
state.mainQuest.uncatalogedBoxes.push({
  id: 'ub1', location: 'garage', description: null, quantity: 5, addedAt: new Date().toISOString()
});
processInput('how much left?', []);
processInput("that's right", []);
processInput('25-50%', []);
processInput('none are done', []);
// Now calibrated
processInput('show progress', []);
assertIncludes('has progress bar', lastBotMessage, '[');
assertIncludes('has percentage', lastBotMessage, '%');
assertIncludes('has remaining estimate', lastBotMessage, 'to catalog');

// ── LIVE RECALCULATION ────────────────────────────────────────────────────────

// 3. Progress bar updates when items are added
console.log('\n3. Progress bar recalculates live as boxes are cataloged');
reset();
state.mainQuest.calibratedAt = new Date().toISOString();
state.mainQuest.completionEstimate = '25-50';
state.mainQuest.uncatalogedBoxes.push({
  id: 'ub1', location: 'garage', description: null, quantity: 5, addedAt: new Date().toISOString()
});
processInput('show progress', []);
let firstMessage = lastBotMessage;
// Add more items
state.boxes.push(makeBox('New Box', 'garage', 20));
processInput('show progress', []);
let secondMessage = lastBotMessage;
assert('messages differ (live recalc)', firstMessage !== secondMessage);
assertIncludes('second message has bar', secondMessage, '[');

// ── RENDERING ─────────────────────────────────────────────────────────────────

// 4. renderProgress creates 8-segment bar
console.log('\n4. renderProgress creates 8-segment bar');
reset();
let estimation = {
  lowPercent: 25,
  highPercent: 50,
  lowRemaining: 50,
  highRemaining: 150,
  itemCount: 35,
  boxCount: 4,
  uncatalogedCount: 5,
  avgItemsPerBox: 8.75
};
let bar = app.renderProgress(estimation);
assertIncludes('has filled blocks', bar, '█');
assertIncludes('has empty blocks', bar, '▒');
assertIncludes('has percentage range', bar, '25-50%');
assertIncludes('has remaining estimate', bar, '~50-150');
assertIncludes('has to catalog', bar, 'to catalog');

// 5. Bar uses 8 color segments
console.log('\n5. Bar uses 8 color spans');
let colorCount = (bar.match(/<span style="color:/g) || []).length;
assert('has 8 color spans', colorCount === 8);

// 6. Colors differ between filled and empty
console.log('\n6. Filled segments use dark colors, empty use light colors');
assertIncludes('has dark sakura CSS var', bar, 'var(--sakura)');
assertIncludes('has light butter CSS var for incomplete', bar, 'var(--butter)');

// 7. Single percentage shows without range
console.log('\n7. Single percentage (no range) displayed correctly');
let singleEstimation = {
  lowPercent: 50,
  highPercent: 50,
  lowRemaining: 100,
  highRemaining: 100,
  itemCount: 100,
  boxCount: 10,
  uncatalogedCount: 0,
  avgItemsPerBox: 10
};
let singleBar = app.renderProgress(singleEstimation);
assertIncludes('shows 50%', singleBar, '50%');
assertNotIncludes('no range dash', singleBar, '50-50%');
assertIncludes('shows ~100 remaining', singleBar, '~100');

// 8. Zero percent shows all empty
console.log('\n8. Zero percent shows all empty blocks');
let zeroEstimation = {
  lowPercent: 0,
  highPercent: 5,
  lowRemaining: 500,
  highRemaining: 1000,
  itemCount: 10,
  boxCount: 1,
  uncatalogedCount: 50,
  avgItemsPerBox: 10
};
let zeroBar = app.renderProgress(zeroEstimation);
let emptyCount = (zeroBar.match(/▒/g) || []).length;
assert('all 8 blocks empty', emptyCount === 8);

// 9. 100 percent shows all filled
console.log('\n9. 100 percent shows all filled blocks');
let fullEstimation = {
  lowPercent: 95,
  highPercent: 100,
  lowRemaining: 0,
  highRemaining: 10,
  itemCount: 1000,
  boxCount: 100,
  uncatalogedCount: 0,
  avgItemsPerBox: 10
};
let fullBar = app.renderProgress(fullEstimation);
let filledCount = (fullBar.match(/█/g) || []).length;
assert('all 8 blocks filled', filledCount === 8);

// 10. Mid-range shows partial fill
console.log('\n10. 37-62% shows partial fill (4 segments)');
let midEstimation = {
  lowPercent: 37,
  highPercent: 62,
  lowRemaining: 50,
  highRemaining: 100,
  itemCount: 50,
  boxCount: 5,
  uncatalogedCount: 5,
  avgItemsPerBox: 10
};
let midBar = app.renderProgress(midEstimation);
let midFilled = (midBar.match(/█/g) || []).length;
let midEmpty = (midBar.match(/▒/g) || []).length;
assert('has both filled and empty', midFilled > 0 && midEmpty > 0);
assert('total 8 segments', midFilled + midEmpty === 8);

// ── INTEGRATION ───────────────────────────────────────────────────────────────

// 11. Show progress displays bar between stats and fate breakdown
console.log('\n11. Bar appears between basic stats and fate breakdown');
reset();
state.mainQuest.calibratedAt = new Date().toISOString();
state.mainQuest.completionEstimate = '50-75';
processInput('show progress', []);
let statsIndex = lastBotMessage.indexOf('cataloged');
let barIndex = lastBotMessage.indexOf('[');
let fateIndex = lastBotMessage.indexOf('Keep');
assert('stats before bar', statsIndex < barIndex);
assert('bar before fates', barIndex < fateIndex);

// 12. Calibration result still shows estimation without bar
console.log('\n12. Calibration result shows estimation text, not bar');
reset();
state.mainQuest.uncatalogedBoxes.push({
  id: 'ub1', location: 'garage', description: null, quantity: 3, addedAt: new Date().toISOString()
});
processInput('how much left?', []);
processInput("that's right", []);
processInput('25-50%', []);
processInput('none are done', []);
assertNotIncludes('calibration result has no bar brackets', lastBotMessage, '[');
assertIncludes('shows estimation complete', lastBotMessage, 'Estimation complete');
assertIncludes('shows percentage', lastBotMessage, '%');

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
