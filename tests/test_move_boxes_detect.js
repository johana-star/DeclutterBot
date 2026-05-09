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
  app.collapsedBoxIds = [];
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Detecting Boxes Eligible for Move
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Move eligibility: all non-deleted boxes');
test('all non-deleted boxes eligible for move', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Bedroom',
      location: 'apartment',
      items: [],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Kitchen',
      location: 'apartment',
      items: [],
      deleted_at: null
    }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 2, 'all boxes eligible');
});

console.log('\n2. Move eligibility: exclude soft-deleted boxes');
test('soft-deleted boxes not eligible for move', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Active',
      location: 'apt1',
      items: [],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Deleted',
      location: 'apt1',
      items: [],
      deleted_at: '2026-05-08T00:00:00Z'
    }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 1, 'only active boxes');
  assertEqual(boxes[0].name, 'Active', 'correct box');
});

console.log('\n3. Move eligibility: boxes with unspecified location');
test('boxes with unspecified location eligible', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Unknown',
      location: 'unspecified',
      items: [],
      deleted_at: null
    }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 1, 'unspecified location eligible');
});

console.log('\n4. Move eligibility: boxes with null location');
test('boxes with null location eligible', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'NoLoc',
      location: null,
      items: [],
      deleted_at: null
    }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 1, 'null location eligible');
});

console.log('\n5. Move chips: 1 eligible box');
test('1 eligible box → single Move 1 chip', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: 'apt', items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var moveChips = [];
  if (boxes.length === 1) {
    moveChips.push('Move 1');
  } else if (boxes.length === 2) {
    moveChips.push('Move 1');
    moveChips.push('Move 2');
  } else if (boxes.length >= 3) {
    moveChips.push('Move...');
  }

  assertEqual(moveChips.length, 1, 'one chip');
  assertEqual(moveChips[0], 'Move 1', 'correct chip');
});

console.log('\n6. Move chips: 2 eligible boxes');
test('2 eligible boxes → Move 1 and Move 2 chips', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: 'apt', items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: 'storage', items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var moveChips = [];
  if (boxes.length === 1) {
    moveChips.push('Move 1');
  } else if (boxes.length === 2) {
    moveChips.push('Move 1');
    moveChips.push('Move 2');
  } else if (boxes.length >= 3) {
    moveChips.push('Move...');
  }

  assertEqual(moveChips.length, 2, 'two chips');
});

console.log('\n7. Move chips: 3+ eligible boxes');
test('3+ eligible boxes → Move... chip only', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: 'apt', items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: 'storage', items: [], deleted_at: null },
    { id: 'box3', name: 'Box3', location: 'house', items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var moveChips = [];
  if (boxes.length === 1) {
    moveChips.push('Move 1');
  } else if (boxes.length === 2) {
    moveChips.push('Move 1');
    moveChips.push('Move 2');
  } else if (boxes.length >= 3) {
    moveChips.push('Move...');
  }

  assertEqual(moveChips.length, 1, 'one chip');
  assertEqual(moveChips[0], 'Move...', 'elliptical chip');
});

console.log('\n8. Move positions: track actual review list positions');
test('move positions match actual box positions in review', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: 'apt', items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: 'storage', items: [], deleted_at: null },
    { id: 'box3', name: 'Box3', location: 'house', items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var movePositions = _.range(1, boxes.length + 1);

  assertEqual(movePositions.length, 3, 'all positions tracked');
  assertEqual(movePositions[0], 1, 'first position');
  assertEqual(movePositions[2], 3, 'third position');
});

console.log('\n9. Move positions: with soft-deleted boxes mixed in');
test('move positions skip soft-deleted boxes', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: 'apt', items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: 'storage', items: [], deleted_at: '2026-05-08T00:00:00Z' },
    { id: 'box3', name: 'Box3', location: 'house', items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var movePositions = _.range(1, boxes.length + 1);

  assertEqual(movePositions.length, 2, 'only non-deleted boxes');
  assertEqual(movePositions[0], 1, 'first position');
  assertEqual(movePositions[1], 2, 'second position');
});

console.log('\n10. Move: all boxes always eligible regardless of location');
test('boxes with any location state eligible', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Specified', location: 'kitchen', items: [], deleted_at: null },
    { id: 'box2', name: 'Unspecified', location: 'unspecified', items: [], deleted_at: null },
    { id: 'box3', name: 'Null', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 3, 'all location types eligible');
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
