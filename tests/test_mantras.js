// test_mantras.js — Tests for the mantra system
// Run with: node tests/test_mantras.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var messages = [];
var localStorageData = {};

global.addBotMessage    = function(text) { messages.push(text); };
global.addUserMessage   = function() {};
global.setChips         = function() {};
global.renderSidebar    = function() {};
global.updateContextBar = function() {};
global.showTyping       = function() {};
global.hideTyping       = function() {};
global.saveState        = function() {};
global.localStorage     = {
  getItem:    function(k) { return localStorageData[k] || null; },
  setItem:    function(k, v) { localStorageData[k] = v; },
  removeItem: function(k) { delete localStorageData[k]; }
};
global.document = {
  getElementById: function() { return { innerHTML: '', value: '', style: {}, scrollTop: 0, textContent: '', appendChild: function(){}, classList: { add: function(){}, remove: function(){} } }; },
  createElement:  function(tag) { return { tagName: tag, className: '', innerHTML: '', appendChild: function(){}, style: {}, scrollTop: 0 }; },
  querySelector:  function() { return null; },
  addEventListener: function() {}
};

var app              = require('../app.js');
var mantra           = app.mantra;
var MANTRAS          = app.MANTRAS;
var maybeMantraOnItem = app.maybeMantraOnItem;
var setMantrasEnabled = app.setMantrasEnabled;
var getMantrasEnabled = app.getMantrasEnabled;
var state            = app.state;

// ── HARNESS ───────────────────────────────────────────────────────────────────
var passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}

function withMantras(fn) {
  setMantrasEnabled(true);
  messages = [];
  fn();
  setMantrasEnabled(false);
}

console.log('\nMantra Tests\n');

// ── Disabled by default in test environment ───────────────────────────────────
console.log('1. Mantras disabled by default in Node');
assert('mantras disabled in Node', getMantrasEnabled() === false);
messages = [];
mantra('load');
assert('no message when disabled', messages.length === 0);

// ── Enabling works ────────────────────────────────────────────────────────────
console.log('\n2. Enabling mantras allows messages');
withMantras(function() {
  mantra('load');
  assert('message sent when enabled', messages.length === 1);
  assert('message is italic', messages[0].startsWith('<em>') && messages[0].endsWith('</em>'));
});

// ── Each pool contains valid strings ─────────────────────────────────────────
console.log('\n3. All mantra pools are non-empty arrays of strings');
var pools = ['load', 'trashed', 'itemAdded', 'boxDone', 'sessionDone'];
pools.forEach(function(pool) {
  assert(pool + ' pool exists', Array.isArray(MANTRAS[pool]));
  assert(pool + ' pool is non-empty', MANTRAS[pool].length > 0);
  assert(pool + ' pool contains strings', MANTRAS[pool].every(function(m) { return typeof m === 'string' && m.length > 0; }));
});

// ── Mantra selects from correct pool ─────────────────────────────────────────
console.log('\n4. mantra() selects from the correct pool');
pools.forEach(function(pool) {
  withMantras(function() {
    mantra(pool);
    var text = messages[0].slice(4, -5); // strip <em> and </em> tags
    assert(pool + ' mantra comes from its pool', MANTRAS[pool].indexOf(text) !== -1);
  });
});

// ── Unknown context falls back to load pool ───────────────────────────────────
console.log('\n5. Unknown context falls back to load pool');
withMantras(function() {
  mantra('unknownContext');
  var text = messages[0].slice(4, -5); // strip <em> and </em> tags
  assert('falls back to load pool', MANTRAS.load.indexOf(text) !== -1);
});

// ── maybeMantraOnItem fires every 7th call ────────────────────────────────────
// Commented out, this feature is on hold, uncomment when the feature is approved.
// console.log('\n6. maybeMantraOnItem fires on every 7th call');
// setMantrasEnabled(true);
// messages = [];
// // Reset counter by calling 6 times — should not fire
// for (var i = 0; i < 6; i++) maybeMantraOnItem();
// assert('no mantra before 7th call', messages.length === 0);
// maybeMantraOnItem(); // 7th call
// assert('mantra fires on 7th call', messages.length === 1);
// maybeMantraOnItem(); // 8th — should not fire
// assert('no mantra on 8th call', messages.length === 1);
// setMantrasEnabled(false);

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
