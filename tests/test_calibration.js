// test_calibration.js — Tests for calibration questions (Main Quest Milestone 3)
// Run with: node tests/test_calibration.js

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
function makeBox(name, location, itemCount) {
  let items = [];
  for (let i = 0; i < itemCount; i++) {
    items.push({ id: app.uid(), name: `item ${i+1}`, fate: 'keep', notes: '', deleted_at: null });
  }
  return { id: app.uid(), name, location, notes: '', items, parentId: null };
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

console.log('\nMain Quest - Milestone 3: Calibration Questions\n');

// ── ENTRY POINTS ──────────────────────────────────────────────────────────────

// 1. "how much left?" triggers calibration
console.log('1. "how much left?" starts calibration flow');
reset();
processInput('how much left?', []);
assert('stage is AWAITING_CALIBRATION_BOXES', state.conversationStage === 'AWAITING_CALIBRATION_BOXES');
assertIncludes('mentions cataloged count', lastBotMessage, '4');
assertIncludes('asks about boxes', lastBotMessage, 'uncataloged');

// 2. "estimate" alias works
console.log('\n2. "estimate" alias works');
reset();
processInput('estimate', []);
assert('stage is AWAITING_CALIBRATION_BOXES', state.conversationStage === 'AWAITING_CALIBRATION_BOXES');

// 3. "calibrate" alias works
console.log('\n3. "calibrate" alias works');
reset();
processInput('calibrate', []);
assert('stage is AWAITING_CALIBRATION_BOXES', state.conversationStage === 'AWAITING_CALIBRATION_BOXES');

// 4. Help menu includes calibration
console.log('\n4. Help menu includes "How much left?"');
reset();
processInput('help', []);
assertIncludes('help has how much left', lastBotMessage, 'How much left');

// 5. Show progress offers calibration chip
console.log('\n5. Show progress offers "How much left?" chip');
reset();
processInput('show progress', []);
assert('chip offered', lastChips.indexOf('How much left?') !== -1);

// ── STEP 1: BOX COUNT ─────────────────────────────────────────────────────────

// 6. With no uncataloged boxes, asks how many
console.log('\n6. With no uncataloged boxes, asks how many');
reset();
processInput('how much left?', []);
assertIncludes('asks how many', lastBotMessage, 'How many');
assert('has None chip', lastChips.indexOf('None') !== -1);

// 7. Answering "none" moves to percent step
console.log('\n7. Answering "none" moves to percent step');
processInput('none', []);
assert('stage is AWAITING_CALIBRATION_PERCENT', state.conversationStage === 'AWAITING_CALIBRATION_PERCENT');
assertIncludes('asks percentage', lastBotMessage, 'percentage');

// 8. With uncataloged boxes mapped, shows existing count
console.log('\n8. With existing uncataloged boxes, shows count');
reset();
state.mainQuest.uncatalogedBoxes = [
  { id: 'ub1', location: 'garage', description: null, quantity: 5, addedAt: new Date().toISOString() }
];
processInput('how much left?', []);
assertIncludes('shows existing count', lastBotMessage, '5');
assertIncludes('asks if accurate', lastBotMessage, 'accurate');
assert('has confirm chip', lastChips.indexOf("That's right") !== -1);

// 9. Confirming existing count moves on
console.log('\n9. Confirming existing count moves to percent');
processInput("that's right", []);
assert('stage is AWAITING_CALIBRATION_PERCENT', state.conversationStage === 'AWAITING_CALIBRATION_PERCENT');

// 10. Giving a number creates generic uncataloged entry
console.log('\n10. Giving a number creates generic uncataloged entry');
reset();
processInput('how much left?', []);
processInput('10', []);
assert('uncataloged entry created', state.mainQuest.uncatalogedBoxes.length === 1);
assert('quantity is 10', state.mainQuest.uncatalogedBoxes[0].quantity === 10);
assert('moved to percent', state.conversationStage === 'AWAITING_CALIBRATION_PERCENT');

// 11. Previous calibration mentioned on repeat
console.log('\n11. Previous calibration mentioned on repeat');
reset();
state.mainQuest.calibratedAt = new Date().toISOString();
state.mainQuest.uncatalogedBoxes = [
  { id: 'ub1', location: 'garage', description: null, quantity: 3, addedAt: new Date().toISOString() }
];
processInput('how much left?', []);
assertIncludes('mentions last estimate', lastBotMessage, 'last estimated');

// ── STEP 2: PERCENTAGE ────────────────────────────────────────────────────────

// 12. Each percentage bucket is recognized
console.log('\n12. Each percentage bucket is recognized');
reset();
processInput('how much left?', []);
processInput('none', []);

processInput('less than 25%', []);
assert('less-than-25 stored', state.mainQuest.completionEstimate === 'less-than-25');

// 13. 25-50% recognized
console.log('\n13. 25-50% recognized');
reset();
processInput('how much left?', []);
processInput('none', []);
processInput('25-50%', []);
assert('25-50 stored', state.mainQuest.completionEstimate === '25-50');

// 14. 50-75% recognized
console.log('\n14. 50-75% recognized');
reset();
processInput('how much left?', []);
processInput('none', []);
processInput('50-75%', []);
assert('50-75 stored', state.mainQuest.completionEstimate === '50-75');

// 15. 75-95% recognized
console.log('\n15. 75-95% recognized');
reset();
processInput('how much left?', []);
processInput('none', []);
processInput('75-95%', []);
assert('75-95 stored', state.mainQuest.completionEstimate === '75-95');

// 16. Invalid input re-prompts
console.log('\n16. Invalid percentage input re-prompts');
reset();
processInput('how much left?', []);
processInput('none', []);
processInput('banana', []);
assert('still on percent step', state.conversationStage === 'AWAITING_CALIBRATION_PERCENT');
assertIncludes('re-prompts', lastBotMessage, 'pick one');

// 17. Previous estimate mentioned on repeat
console.log('\n17. Previous estimate mentioned on repeat');
reset();
state.mainQuest.completionEstimate = '25-50';
processInput('how much left?', []);
processInput('none', []);
assertIncludes('mentions previous', lastBotMessage, '25-50%');

// ── STEP 3: COMPLETED LOCATIONS ───────────────────────────────────────────────

// 18. Locations step shows all known locations
console.log('\n18. Locations step shows known locations');
reset();
processInput('how much left?', []);
processInput('none', []);
processInput('25-50%', []);
assert('stage is AWAITING_CALIBRATION_LOCATIONS', state.conversationStage === 'AWAITING_CALIBRATION_LOCATIONS');
assertIncludes('asks which done', lastBotMessage, 'done');

// 19. Selecting a location marks it done
console.log('\n19. Selecting a location marks it done');
processInput('kitchen', []);
assert('kitchen marked done', state.mainQuest.completedLocations.indexOf('kitchen') !== -1);
assertIncludes('confirms selection', lastBotMessage, 'kitchen');

// 20. Selecting again toggles it off
console.log('\n20. Selecting same location toggles it off');
processInput('kitchen', []);
assert('kitchen unmarked', state.mainQuest.completedLocations.indexOf('kitchen') === -1);

// 21. "none are done" clears and finishes
console.log('\n21. "none are done" clears and finishes');
reset();
processInput('how much left?', []);
processInput('none', []);
processInput('25-50%', []);
processInput('none are done', []);
assert('completed locations empty', state.mainQuest.completedLocations.length === 0);
assert('calibratedAt set', state.mainQuest.calibratedAt !== null);
assertIncludes('shows result', lastBotMessage, 'done');

// 22. "all are done" marks everything
console.log('\n22. "all are done" marks all locations');
reset();
processInput('how much left?', []);
processInput('none', []);
processInput('50-75%', []);
processInput('all are done', []);
assert('all locations marked', state.mainQuest.completedLocations.length === 4);

// 23. "continue" finishes
console.log('\n23. "continue" finishes calibration');
reset();
processInput('how much left?', []);
processInput('none', []);
processInput('25-50%', []);
processInput('kitchen', []);
processInput('continue', []);
assert('calibratedAt set', state.mainQuest.calibratedAt !== null);
assertIncludes('shows estimation', lastBotMessage, 'done');

// ── CALCULATION LOGIC ─────────────────────────────────────────────────────────

// 24. calculateCalibration with bottom-up data
console.log('\n24. calculateCalibration with uncataloged boxes');
reset();
state.mainQuest.uncatalogedBoxes = [
  { id: 'ub1', location: 'garage', description: null, quantity: 4, addedAt: new Date().toISOString() }
];
state.mainQuest.completionEstimate = '25-50';
let cal = app.calculateCalibration();
assert('has lowPercent', typeof cal.lowPercent === 'number');
assert('has highPercent', typeof cal.highPercent === 'number');
assert('low <= high', cal.lowPercent <= cal.highPercent);
assert('itemCount is 35', cal.itemCount === 35);
assert('boxCount is 4', cal.boxCount === 4);

// 25. calculateCalibration with no data
console.log('\n25. calculateCalibration with no data returns wide range');
reset();
let calEmpty = app.calculateCalibration();
assert('lowPercent is 0', calEmpty.lowPercent === 0);
assert('highPercent is 100', calEmpty.highPercent === 100);

// 26. calculateCalibration with spatial data
console.log('\n26. calculateCalibration with completed locations');
reset();
state.mainQuest.completionEstimate = '50-75';
state.mainQuest.completedLocations = ['kitchen', 'bedroom'];
let calSpatial = app.calculateCalibration();
assert('spatial estimate factors in', calSpatial.lowPercent <= 75);
assert('spatial percent reasonable', calSpatial.highPercent >= 50);

// 27. calibrationPercentRange returns correct ranges
console.log('\n27. calibrationPercentRange returns correct ranges');
let r1 = app.calibrationPercentRange('less-than-25');
assert('less-than-25 is [5,25]', r1[0] === 5 && r1[1] === 25);
let r2 = app.calibrationPercentRange('25-50');
assert('25-50 is [25,50]', r2[0] === 25 && r2[1] === 50);
let r3 = app.calibrationPercentRange('50-75');
assert('50-75 is [50,75]', r3[0] === 50 && r3[1] === 75);
let r4 = app.calibrationPercentRange('75-95');
assert('75-95 is [75,95]', r4[0] === 75 && r4[1] === 95);
let r5 = app.calibrationPercentRange('95-100');
assert('95-100 is [95,100]', r5[0] === 95 && r5[1] === 100);
let r6 = app.calibrationPercentRange('0-5');
assert('0-5 is [0,5]', r6[0] === 0 && r6[1] === 5);

// 28. calibrationPercentLabel returns human labels
console.log('\n28. calibrationPercentLabel returns human labels');
assert('0-5', app.calibrationPercentLabel('0-5') === '0-5%');
assert('less-than-25', app.calibrationPercentLabel('less-than-25') === 'less than 25%');
assert('75-95', app.calibrationPercentLabel('75-95') === '75-95%');
assert('95-100', app.calibrationPercentLabel('95-100') === '95-100%');

// ── FULL FLOW ─────────────────────────────────────────────────────────────────

// 29. Complete calibration flow end-to-end
console.log('\n29. Complete calibration flow end-to-end');
reset();
state.mainQuest.uncatalogedBoxes = [
  { id: 'ub1', location: 'garage', description: null, quantity: 6, addedAt: new Date().toISOString() }
];
processInput('how much left?', []);
assert('step 1', state.conversationStage === 'AWAITING_CALIBRATION_BOXES');
processInput("that's right", []);
assert('step 2', state.conversationStage === 'AWAITING_CALIBRATION_PERCENT');
processInput('25-50%', []);
assert('step 3', state.conversationStage === 'AWAITING_CALIBRATION_LOCATIONS');
processInput('kitchen', []);
processInput('continue', []);
assert('finished', state.conversationStage === 'FINISHED');
assert('calibratedAt set', state.mainQuest.calibratedAt !== null);
assert('estimate stored', state.mainQuest.completionEstimate === '25-50');
assert('locations stored', state.mainQuest.completedLocations.length === 1);
assertIncludes('shows percentage range', lastBotMessage, '%');
assertIncludes('shows items logged', lastBotMessage, '35');

// 30. Calibration works from BOX_OPEN stage and returns to it
console.log('\n30. Calibration returns to previous stage');
reset();
state.conversationStage = 'BOX_OPEN';
state.activeBoxId = state.boxes[0].id;
processInput('how much left?', []);
processInput('none', []);
processInput('50-75%', []);
processInput('none are done', []);
assert('returns to BOX_OPEN', state.conversationStage === 'BOX_OPEN');

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
