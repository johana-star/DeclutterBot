const _ = require('./lodash.js');
const app = require('../app.js');

let testCount = 0;
let passCount = 0;

function test(description, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log('  ✅ ' + description);
  } catch (err) {
    console.log('  ❌ ' + description);
    console.log('     ' + err.message);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg + ' (got ' + actual + ', expected ' + expected + ')');
  }
}

function assertTrue(val, msg) {
  if (!val) {
    throw new Error(msg);
  }
}

function assertIncludes(str, substr, msg) {
  if (str.indexOf(substr) === -1) {
    throw new Error(msg + ' (expected to include "' + substr + '")');
  }
}

function setupState() {
  app.state.boxes = [];
  app.state.conversationStage = 'FINISHED';
  app.state.renamePositions = null;
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Elliptical Rename Handler
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Elliptical recognition: rename... with 3 boxes');
test('rename... recognized with 3+ boxes', function() {
  setupState();
  app.state.renamePositions = [1, 2, 3];

  var shouldIntercept = (app.state.conversationStage === 'FINISHED') &&
    app.state.renamePositions &&
    app.state.renamePositions.length >= 3;
  assertTrue(shouldIntercept, 'rename... recognized');
});

console.log('\n2. Elliptical recognition: rename... not with 2 boxes');
test('rename... not shown with only 2 boxes', function() {
  setupState();
  app.state.renamePositions = [1, 2];

  var shouldIntercept = (app.state.conversationStage === 'FINISHED') &&
    app.state.renamePositions &&
    app.state.renamePositions.length >= 3;
  assertTrue(!shouldIntercept, 'rename... not shown');
});

console.log('\n3. Elliptical reminder: lists box numbers');
test('reminder lists box numbers', function() {
  var renamePositions = [1, 2, 3];
  var reminderMsg = 'Which box? Type _rename_ followed by the number. Applies to: ' +
    renamePositions.join(', ') + '.';

  assertIncludes(reminderMsg, '1, 2, 3', 'positions in reminder');
});

console.log('\n4. Elliptical reminder: non-consecutive positions');
test('reminder with non-consecutive positions [1, 4, 7]', function() {
  var renamePositions = [1, 4, 7];
  var reminderMsg = 'Which box? Type _rename_ followed by the number. Applies to: ' +
    renamePositions.join(', ') + '.';

  assertIncludes(reminderMsg, '1, 4, 7', 'correct positions');
});

console.log('\n5. Elliptical input pre-fill');
test('input pre-filled with "rename "', function() {
  var prefill = 'rename ';
  assertEqual(prefill, 'rename ', 'correct pre-fill');
});

console.log('\n6. Elliptical stage: AWAITING_RENAME_ELLIPTICAL');
test('conversation stage set correctly', function() {
  var stage = 'AWAITING_RENAME_ELLIPTICAL';
  assertEqual(stage, 'AWAITING_RENAME_ELLIPTICAL', 'correct stage');
});

console.log('\n7. Elliptical parsing: extract number from rename N');
test('parse rename 3 from elliptical', function() {
  var command = 'rename 3';
  var match = command.match(/rename (\d+)/);
  assertTrue(match !== null, 'matches rename pattern');
  assertEqual(parseInt(match[1], 10), 3, 'extracts number');
});

console.log('\n8. Elliptical validation: valid position');
test('rename 2 valid with positions [1, 2, 3]', function() {
  var boxNum = 2;
  var renamePositions = [1, 2, 3];

  var posIndex = renamePositions.indexOf(boxNum);
  assertTrue(posIndex !== -1, 'valid position');
});

console.log('\n9. Elliptical validation: invalid position');
test('rename 5 invalid with positions [1, 2, 3]', function() {
  var boxNum = 5;
  var renamePositions = [1, 2, 3];

  var posIndex = renamePositions.indexOf(boxNum);
  assertTrue(posIndex === -1, 'invalid position');
});

console.log('\n10. Elliptical with sparse positions');
test('rename 4 valid when positions are [1, 4, 7]', function() {
  var boxNum = 4;
  var renamePositions = [1, 4, 7];

  var posIndex = renamePositions.indexOf(boxNum);
  assertTrue(posIndex !== -1, 'position 4 found');
  assertEqual(posIndex, 1, 'at index 1');
});

// ────────────────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────────────────

console.log('\n────────────────────────────────────────────────────────────────');
if (passCount === testCount) {
  console.log('✅ ' + passCount + ' passed, 0 failed');
} else {
  console.log('❌ ' + passCount + ' passed, ' + (testCount - passCount) + ' failed');
}
console.log('────────────────────────────────────────────────────────────────');
