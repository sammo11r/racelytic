(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WecArchiveScopeModel = api;
})(typeof window === 'undefined' ? null : window, function () {
  function matches(entity, options = {}) {
    const from = options.from == null ? null : Number(options.from);
    const to = options.to == null ? null : Number(options.to);
    const classCode = options.classCode && options.classCode !== 'all' ? options.classCode : null;
    const manufacturerId = options.manufacturerId && options.manufacturerId !== 'all' ? options.manufacturerId : null;
    const scoped = from !== null || to !== null || classCode !== null || manufacturerId !== null;
    const inScope = row => (from === null || Number(row.year) >= from)
      && (to === null || Number(row.year) <= to)
      && (!classCode || row.classCode === classCode);
    const rows = (entity.scope || []).filter(row => inScope(row) && (!manufacturerId || row.manufacturerId === manufacturerId));
    if (scoped && !rows.length) return false;

    const achievement = options.achievement || 'all';
    if (achievement === 'all') return true;
    if (achievement === 'champions') {
      if (!scoped) return Number(entity.championships || 0) > 0;
      return (entity.titles || []).some(title => inScope(title) && (!manufacturerId || rows.some(row => Number(row.year) === Number(title.year)
        && (!title.classCode || row.classCode === title.classCode))));
    }
    const metric = { 'overall-winners': 'overallWins', 'class-winners': 'classWins', podiums: 'podiums' }[achievement];
    if (!metric) return true;
    return scoped ? rows.some(row => Number(row[metric] || 0) > 0) : Number(entity[metric] || 0) > 0;
  }

  return { matches };
});
