// DeclutterBot Pure Helper Functions
// ===================================
// These functions have no side effects and no state mutations.
// They are pure utilities that can be called from anywhere.

let _;
if (typeof require !== 'undefined') {
  try {
    _ = require('./lodash.js');
  } catch(e) {
    try {
      _ = require('./tests/lodash.js');
    } catch(e2) {
      console.error('Could not load lodash');
    }
  }
} else {
  _ = window._;
}

function titleize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function singularize(word) {
  if (!word) return word;
  var exceptions = {
    'items': 'item', 'boxes': 'box', 'leaves': 'leaf', 'halves': 'half',
    'knives': 'knife', 'lives': 'life', 'shelves': 'shelf', 'wives': 'wife',
    'loaves': 'loaf', 'calves': 'calf'
  };
  if (exceptions[word]) return exceptions[word];
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ves')) return word.slice(0, -3) + 'f';
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function singularizeLast(phrase) {
  var words = phrase.trim().split(/\s+/);
  if (words.length === 0) return phrase;
  words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(' ');
}

function escapeCSV(value) {
  if (typeof value !== 'string') return value;
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function escHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;

  for (var i = 0; i < line.length; i++) {
    var char = line[i];
    var next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseQuantity(text) {
  var match = text.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;
  var qty = parseInt(match[1], 10);
  if (qty < 2 || qty > 26) return null;
  return { qty: qty, itemName: match[2] };
}

function renderMarkdown(text) {
  if (!text) return '';
  var html = escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\_(.+?)\_/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
  return html;
}

function countFates(box) {
  var activeItems = _.reject(box.items, function(item) { return item.deleted_at; });
  return activeItems.reduce(function(counts, item) {
    counts[item.fate] = (counts[item.fate] || 0) + 1;
    return counts;
  }, {});
}

function groupItems(items, groupBy) {
  return _.groupBy(items, groupBy);
}

function collectFateItems(box) {
  var activeItems = _.reject(box.items, function(item) { return item.deleted_at; });
  var grouped = {};
  FATES.forEach(function(fate) {
    grouped[fate] = _.filter(activeItems, function(item) { return item.fate === fate; });
  });
  return grouped;
}

// Extract trailing number from command (e.g., "delete 5" → 5, "item 5" → 5)
function extractNumberFromCommand(command) {
  var match = command.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function executeReviewAllActionByNumber(command, pattern, positionsArray, handler) {
  var match = command.match(pattern);
  if (match) {
    var boxNum = parseInt(match[1], 10);
    var posIndex = positionsArray.indexOf(boxNum);
    if (posIndex !== -1) {
      handler(posIndex);
      return true;
    }
  }
  return false;
}

function disposalPrompt(item) {
  return '**' + item.name + '** → ' + titleize(item.fate);
}

function buildActionChips() {
  return FATE_TITLES;
}

function fateReviewChips() {
  return _.map(FATES, function(fate) { return 'Review ' + titleize(fate); });
}

function fateReviewBulkChips() {
  return ['Mark all keep', 'Mark all donate', 'Mark all sell', 'Mark all trash', 'Mark all unsure'];
}

function buildFateReviewPath(context) {
  if (context.item) {
    return 'Reviewing ' + context.item.name;
  } else if (context.boxName) {
    return 'Reviewing ' + context.boxName;
  }
  return 'Reviewing items';
}

function eligibleGroupNumbers(items) {
  var groups = groupItems(items, 'fate');
  var eligible = [];
  FATES.forEach(function(fate, idx) {
    if (groups[fate] && groups[fate].length > 0) {
      eligible.push(idx + 1);
    }
  });
  return eligible;
}

function nestChipLabel(parentBox) {
  if (!parentBox) return 'Nest';
  return 'Nest into ' + parentBox.name;
}

function dumpChipLabel() {
  return 'Dump into another';
}

function isReservedCommand(text) {
  var cmd = text.toLowerCase().trim();

  var exactReserved = [
    'reset', 'start over', 'done', 'done with this box', 'skip to next box',
    'delete box', 'delete this box', 'trash all', 'new box', 'another',
    'review all', 'review by fate', 'review items',
    'nest', 'put inside', 'nest box', 'move box', 'add item',
    'm', 'move', 'move to box',
    'dump into...'
  ];
  if (exactReserved.includes(cmd)) return true;

  if (/\.\.\.$/.test(cmd)) {
    var base = cmd.replace(/\.\.\.$/, '');
    var reserved = ['delete', 'rename', 'move', 'donate', 'keep', 'sell', 'trash', 'unsure', 'review', 'dump'];
    if (reserved.includes(base)) return true;
  }

  if (/^(delete|rename|move|trash)\s+\d+$/.test(cmd)) return true;

  if (/^review\s+(keep|donate|trash|sell|unsure)(\s*\(\d+\))?$/.test(cmd)) return true;

  return false;
}

function maybeMantraOnItem(item) {
  if (item.fate === 'unsure') {
    return '\n\n_' + mantra() + '_';
  }
  return '';
}

function mantra() {
  var mantras = [
    'Every object has a life story—yours deserve a home that celebrates their purpose.',
    'Keep what brings joy or serves a purpose. Everything else is overhead.',
    'Ownership is stewardship: keep what you can honor.',
    'When in doubt: useful now, useful soon, or beautiful? If none—it goes.',
    'Things are tools, not trophies. Use them or release them.'
  ];
  return mantras[Math.floor(Math.random() * mantras.length)];
}

function activeItems(box) {
  return box ? _.reject(box.items, (item) => item.deleted_at) : [];
}

// Export for Node.js testing (when required as module)
if (typeof module !== 'undefined' && module.exports) {
  const exports = {
    titleize, singularize, singularizeLast, escapeCSV, escHtml,
    parseCSVLine, parseQuantity, renderMarkdown, countFates, groupItems,
    collectFateItems, executeReviewAllActionByNumber, disposalPrompt,
    buildActionChips, fateReviewChips, fateReviewBulkChips, buildFateReviewPath,
    eligibleGroupNumbers, nestChipLabel, dumpChipLabel, isReservedCommand,
    maybeMantraOnItem, mantra, extractNumberFromCommand, activeItems
  };
  
  // Make available globally
  if (typeof global !== 'undefined') {
    Object.assign(global, exports);
  }
  
  module.exports = exports;
}
