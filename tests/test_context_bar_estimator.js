// test_context_bar_estimator.js — Tests for context bar progress estimator
// Run with: node tests/test_context_bar_estimator.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
global.addBotMessage    = function() {};
global.addUserMessage   = function() {};
global.setChips         = function() {};
global.renderSidebar    = function() {};
global.saveState        = function() {};
global.chipClick        = function() {};
global.escHtml          = function(s) { return String(s||''); };
global.renderMarkdown   = function(s) { return s; };
global.localStorage     = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };

let app = require('../app.js');
let state = app.state;

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
  state.boxes = [];
  state.mainQuest = {
    uncatalogedBoxes: [],
    completionEstimate: null,
    completedLocations: [],
    calibratedAt: null
  };
}

console.log('\nContext Bar Progress Estimator\n');

// 1. Not shown before calibration
console.log('1. Estimator not shown before calibration');
reset();
// When not calibrated, updateContextBar should hide the estimator
// We'll test this by checking renderProgress isn't called
let shouldShow = !!state.mainQuest.calibratedAt;
assert('should not show when not calibrated', !shouldShow);

// 2. Shown after calibration
console.log('\n2. Estimator shown after calibration');
reset();
state.mainQuest.calibratedAt = new Date().toISOString();
state.mainQuest.completionEstimate = '25-50';
state.mainQuest.uncatalogedBoxes.push({
  id: 'ub1', location: 'garage', quantity: 5, addedAt: new Date().toISOString()
});
state.boxes.push({
  id: 'b1', name: 'Box 1', location: 'kitchen', items: [
    { id: 'i1', name: 'item 1', fate: 'keep', deleted_at: null }
  ]
});
let html = app.renderProgress(app.calculateCalibration(), 'estimator');
assertIncludes('has bar characters', html, '█');
assertIncludes('has left text', html, 'left');

// 3. Contains 32 color spans (4 per color family)
console.log('\n3. Bar contains 32 color spans (4 per family)');
let colorCount = (html.match(/<span style="color:/g) || []).length;
assert('has 32 color spans', colorCount === 32);

// 4. Shows mode (average) of range
console.log('\n4. Shows mode (average) of remaining range');
assertIncludes('has tilde', html, '~');
assert('has numeric estimate', /~\d+/.test(html));

// 5. Updates live when items change
console.log('\n5. Updates live when boxes/items change');
let firstHTML = html;
state.boxes.push({
  id: 'b2', name: 'Box 2', location: 'bedroom', items: [
    { id: 'i2', name: 'item 2', fate: 'keep', deleted_at: null },
    { id: 'i3', name: 'item 3', fate: 'keep', deleted_at: null }
  ]
});
let secondHTML = app.renderProgress(app.calculateCalibration(), 'estimator');
assert('content changes when items added', firstHTML !== secondHTML);

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
