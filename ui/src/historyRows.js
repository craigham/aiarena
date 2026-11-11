export function historyRows(history, cellsPerRow) {
  const ordered = [...(history || [])].sort((a, b) => {
    const roundDelta = a.round - b.round;
    if (roundDelta) return roundDelta;
    return a.match - b.match;
  });
  const width = cellsPerRow > 0 ? cellsPerRow : 1;
  const rows = [];

  for (let index = 0; index < ordered.length; index += width) {
    rows.push(ordered.slice(index, index + width));
  }

  return rows;
}
