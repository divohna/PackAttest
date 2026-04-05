'use strict';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const STATUS_SYMBOL = {
  added: '+',
  modified: '~',
  removed: '-',
  unchanged: ' ',
};

function choiceTitle(entry, warnings) {
  const sym = STATUS_SYMBOL[entry.status] || ' ';
  const warn = warnings.length ? '  ' + warnings.map(w => `[${w}]`).join(' ') : '';
  return `${sym} ${entry.path}  (${formatSize(entry.size)})${warn}`;
}

function printDiffSummary(diffEntries) {
  const counts = { added: 0, modified: 0, removed: 0, unchanged: 0 };
  for (const e of diffEntries) counts[e.status] = (counts[e.status] || 0) + 1;

  const parts = [];
  if (counts.added) parts.push(`${counts.added} added`);
  if (counts.modified) parts.push(`${counts.modified} modified`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  if (counts.unchanged) parts.push(`${counts.unchanged} unchanged`);

  console.log(`\nDiff vs previous: ${parts.join(', ') || 'no changes'}`);
}

module.exports = { formatSize, choiceTitle, printDiffSummary };
