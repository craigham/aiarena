export function formatWinRate(winRate) {
  if (typeof winRate !== "number" || !Number.isFinite(winRate)) return "";
  return `${winRate.toFixed(2)}%`;
}

export function compareRankings(a, b) {
  if (!a.division && !b.division) return a.bot.localeCompare(b.bot);
  if (!a.division) return 1;
  if (!b.division) return -1;

  const eloA = Number.isFinite(a.elo) ? a.elo : 0;
  const eloB = Number.isFinite(b.elo) ? b.elo : 0;
  return (a.division !== b.division) ? a.division - b.division : eloB - eloA;
}
