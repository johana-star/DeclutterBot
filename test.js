#!/usr/bin/env node
// test.js — Sortie test runner
// Run with: node test.js

var fs   = require('fs');
var path = require('path');
var dir  = __dirname;

// ── Add new test files here when created ─────────────────────────────────────
var testFiles = [
  'test_move.js',
  'test_remove.js',
  'test_box_batch.js',
  'test_delete_dump.js',
];
// ─────────────────────────────────────────────────────────────────────────────

var totalPassed = 0;
var totalFailed = 0;
var start = Date.now();

// Suppress individual process.exit calls from test files
var originalExit = process.exit;
process.exit = function() {};

testFiles.forEach(function(file) {
  var fullPath = path.join(dir, file);

  if (!fs.existsSync(fullPath)) {
    console.error('\u274c  Missing test file: ' + file);
    totalFailed++;
    return;
  }

  var suitePassed = 0;
  var suiteFailed = 0;
  var origLog   = console.log;
  var origError = console.error;

  // Count by intercepting assert output lines — exactly 2 leading spaces, no "passed"/"failed"
  console.log = function() {
    var msg = arguments[0];
    if (typeof msg === 'string' && msg.match(/^  \u2705 /) && msg.indexOf('passed') === -1) suitePassed++;
    origLog.apply(console, arguments);
  };
  console.error = function() {
    var msg = arguments[0];
    if (typeof msg === 'string' && msg.match(/^  \u274c /) && msg.indexOf('failed') === -1) suiteFailed++;
    origError.apply(console, arguments);
  };

  // Clear module cache so each suite runs in isolation
  delete require.cache[require.resolve(fullPath)];
  var appPath = path.join(dir, 'app.js');
  if (require.cache[appPath]) delete require.cache[appPath];

  try {
    require(fullPath);
  } catch(e) {
    origError('\u274c  Error loading ' + file + ': ' + e.message);
    suiteFailed++;
  }

  console.log = origLog;
  console.error = origError;

  totalPassed += suitePassed;
  totalFailed += suiteFailed;
});

process.exit = originalExit;

var elapsed = ((Date.now() - start) / 1000).toFixed(2) + 's';
console.log('\u2500'.repeat(40));
console.log(
  (totalFailed === 0 ? '\u2705' : '\u274c') +
  '  ' + totalPassed + ' passed, ' + totalFailed + ' failed  (' + elapsed + ')'
);

process.exit(totalFailed > 0 ? 1 : 0);
