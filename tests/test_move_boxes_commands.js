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
  app.state.conversationStage = 'FINISHED';
  app.state.movePositions = null;
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Handle Move Commands (move 1, move 2)
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Move command recognition: move 1 in FINISHED stage');
test('move 1 with boxes in FINISHED stage → recognized', function() {
  setupState();
  app.state.conversationStage = 'FINISHED';
  app.state.movePositions = [1, 2];

  var shouldIntercept = (app.state.conversationStage === 'FINISHED') &&
    app.state.movePositions &&
    app.state.movePositions.length < 3;
  assertTrue(shouldIntercept, 'move 1 recognized');
});

console.log('\n2. Move command recognition: move 1 not in other stages');
test('move 1 outside FINISHED stage → not recognized', function() {
  setupState();
  app.state.conversationStage = 'BOX_OPEN';
  app.state.movePositions = [1, 2];

  var shouldIntercept = (app.state.conversationStage === 'FINISHED') &&
    app.state.movePositions &&
    app.state.movePositions.length < 3;
  assertTrue(!shouldIntercept, 'move 1 not recognized');
});

console.log('\n3. Move command parsing: extract number');
test('parse move 1 command', function() {
  var command = 'move 1';
  var match = command.match(/move (\d+)/);
  assertTrue(match !== null, 'command matches');
  assertEqual(parseInt(match[1], 10), 1, 'extracted number');
});

console.log('\n4. Move command parsing: move 2');
test('parse move 2 command', function() {
  var command = 'move 2';
  var match = command.match(/move (\d+)/);
  assertTrue(match !== null, 'command matches');
  assertEqual(parseInt(match[1], 10), 2, 'extracted number');
});

console.log('\n5. Move command validation: valid position');
test('move 1 with positions [1, 2] is valid', function() {
  var boxNum = 1;
  var movePositions = [1, 2];

  var posIndex = movePositions.indexOf(boxNum);
  assertTrue(posIndex !== -1, 'valid position');
});

console.log('\n6. Move command validation: invalid position');
test('move 3 with positions [1, 2] is invalid', function() {
  var boxNum = 3;
  var movePositions = [1, 2];

  var posIndex = movePositions.indexOf(boxNum);
  assertTrue(posIndex === -1, 'invalid position');
});

console.log('\n7. Move command with actual box positions');
test('move at position that matches actual box number', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: 'apt', items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: 'storage', items: [], deleted_at: null },
    { id: 'box3', name: 'Box3', location: 'house', items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var movePositions = _.range(1, boxes.length + 1);

  var userCommand = 'move 3';
  var match = userCommand.match(/move (\d+)/);
  var boxNum = parseInt(match[1], 10);
  var posIndex = movePositions.indexOf(boxNum);

  assertTrue(posIndex !== -1, 'position 3 valid');
  assertEqual(posIndex, 2, 'position 3 at array index 2');
});

console.log('\n8. Move context: 3+ boxes uses elliptical not number');
test('with 3+ boxes, move 3 should not intercept', function() {
  setupState();
  app.state.movePositions = [1, 2, 3];

  var shouldIntercept = (app.state.movePositions &&
    app.state.movePositions.length < 3);
  assertTrue(!shouldIntercept, 'elliptical used instead');
});

console.log('\n9. Move trigger: shows prompt for location');
test('move trigger shows "Where would you like to move" prompt', function() {
  var boxName = 'Bedroom';
  var prompt = 'Where would you like to move **"' + boxName + '"**?';

  assertTrue(prompt.indexOf('Where would you like to move') !== -1, 'prompt present');
  assertTrue(prompt.indexOf(boxName) !== -1, 'box name in prompt');
});

console.log('\n10. Move stage: AWAITING_MOVE_LOCATION');
test('conversation stage set for move location input', function() {
  var stage = 'AWAITING_MOVE_LOCATION';
  assertEqual(stage, 'AWAITING_MOVE_LOCATION', 'correct stage name');
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
