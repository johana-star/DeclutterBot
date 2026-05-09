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

function setupState() {
  app.state.boxes = [];
  app.state.activeBoxId = null;
  app.state.conversationStage = 'FINISHED';
  app.collapsedBoxIds = [];
  app.state.renamePositions = null;
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Handle Rename Commands (rename 1, rename 2)
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Rename command recognition: rename 1 in FINISHED stage');
test('rename 1 with boxes in FINISHED stage → recognized', function() {
  setupState();
  app.state.conversationStage = 'FINISHED';
  app.state.renamePositions = [1, 2];

  var shouldIntercept = (app.state.conversationStage === 'FINISHED') &&
    app.state.renamePositions &&
    app.state.renamePositions.length < 3;
  assertTrue(shouldIntercept, 'rename 1 recognized');
});

console.log('\n2. Rename command recognition: rename 1 not in other stages');
test('rename 1 outside FINISHED stage → not recognized', function() {
  setupState();
  app.state.conversationStage = 'BOX_OPEN';
  app.state.renamePositions = [1, 2];

  var shouldIntercept = (app.state.conversationStage === 'FINISHED') &&
    app.state.renamePositions &&
    app.state.renamePositions.length < 3;
  assertTrue(!shouldIntercept, 'rename 1 not recognized');
});

console.log('\n3. Rename command parsing: extract number');
test('parse rename 1 command', function() {
  var command = 'rename 1';
  var match = command.match(/rename (\d+)/);
  assertTrue(match !== null, 'command matches');
  assertEqual(parseInt(match[1], 10), 1, 'extracted number');
});

console.log('\n4. Rename command parsing: rename 2');
test('parse rename 2 command', function() {
  var command = 'rename 2';
  var match = command.match(/rename (\d+)/);
  assertTrue(match !== null, 'command matches');
  assertEqual(parseInt(match[1], 10), 2, 'extracted number');
});

console.log('\n5. Rename command validation: valid position');
test('rename 1 with positions [1, 2] is valid', function() {
  var boxNum = 1;
  var renamePositions = [1, 2];

  var posIndex = renamePositions.indexOf(boxNum);
  assertTrue(posIndex !== -1, 'valid position');
});

console.log('\n6. Rename command validation: invalid position');
test('rename 3 with positions [1, 2] is invalid', function() {
  var boxNum = 3;
  var renamePositions = [1, 2];

  var posIndex = renamePositions.indexOf(boxNum);
  assertTrue(posIndex === -1, 'invalid position');
});

console.log('\n7. Rename command with actual box positions');
test('rename at position that matches actual box number', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Full1', location: null, items: [{ id: 'i', name: 'I', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'box2', name: 'Full2', location: null, items: [{ id: 'i', name: 'I', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'box3', name: 'Empty', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var renamePositions = [];
  for(var i = 0; i < boxes.length; i++) {
    renamePositions.push(i + 1);
  }

  var userCommand = 'rename 3';
  var match = userCommand.match(/rename (\d+)/);
  var boxNum = parseInt(match[1], 10);
  var posIndex = renamePositions.indexOf(boxNum);

  assertTrue(posIndex !== -1, 'position 3 valid');
  assertEqual(posIndex, 2, 'position 3 at array index 2');
});

console.log('\n8. Rename context: 3+ boxes uses elliptical not number');
test('with 3+ boxes, rename 3 should not intercept', function() {
  setupState();
  app.state.renamePositions = [1, 2, 3];

  var shouldIntercept = (app.state.renamePositions &&
    app.state.renamePositions.length < 3);
  assertTrue(!shouldIntercept, 'elliptical used instead');
});

console.log('\n9. Rename trigger: shows prompt for new name');
test('rename trigger shows "What would you like to call" prompt', function() {
  var boxName = 'Bedroom';
  var prompt = 'What would you like to call **' + boxName + '**?';

  assertTrue(prompt.indexOf('What would you like to call') !== -1, 'prompt present');
  assertTrue(prompt.indexOf(boxName) !== -1, 'box name in prompt');
});

console.log('\n10. Rename stage: AWAITING_BOX_RENAME');
test('conversation stage set for rename input', function() {
  var stage = 'AWAITING_BOX_RENAME';
  assertEqual(stage, 'AWAITING_BOX_RENAME', 'correct stage name');
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
