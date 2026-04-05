'use strict';

// status: 'added' | 'modified' | 'unchanged' | 'removed'
function computeDiff(currentEntries, previousEntries) {
  const prevMap = new Map(previousEntries.map(e => [e.path, e]));
  const currMap = new Map(currentEntries.map(e => [e.path, e]));
  const result = [];

  for (const entry of currentEntries) {
    const prev = prevMap.get(entry.path);
    if (!prev) {
      result.push({ ...entry, status: 'added' });
    } else if (prev.sha256 !== entry.sha256) {
      result.push({ ...entry, status: 'modified' });
    } else {
      result.push({ ...entry, status: 'unchanged' });
    }
  }

  for (const entry of previousEntries) {
    if (!currMap.has(entry.path)) {
      result.push({ ...entry, status: 'removed' });
    }
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = { computeDiff };
