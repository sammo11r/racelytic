(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.constructorLineageView = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  function years(segment) {
    if (!segment?.fromYear) return 'Years not recorded';
    if (!segment.toYear) return `${segment.fromYear}–present`;
    return Number(segment.toYear) === Number(segment.fromYear) ? String(segment.fromYear) : `${segment.fromYear}–${segment.toYear}`;
  }
  function transition(segment) {
    return segment?.transition?.label || 'Operational continuation';
  }
  function action(segment) {
    const actions = {
      'works-partnership': 'Partnered',
      'ownership-change': 'Acquired',
      'title-partnership': 'Partnered',
      'works-takeover': 'Acquired',
      rebrand: 'Renamed',
      'title-identity': 'Renamed',
      'identity-restored': 'Restored',
      'assets-acquired': 'Assets acquired',
      'management-buyout': 'Bought out',
      'identity-change': 'Renamed',
      restructure: 'Restructured',
      'operational-continuation': 'Continued'
    };
    const key = segment?.transition?.type || transition(segment).toLowerCase().replace(/\s+/g, '-');
    return actions[key] || transition(segment);
  }
  function continuity(segment) {
    const labels = { operation: 'team operation', factory: 'factory', ownership: 'ownership', staff: 'staff', assets: 'assets', 'sporting-identity': 'sporting identity', 'legal-entity': 'legal entity' };
    return (segment?.transition?.continuity || []).map(value => labels[value] || value).join(', ');
  }
  function chart(segments, currentYear = new Date().getFullYear()) {
    const valid = (segments || []).filter(segment => Number(segment?.fromYear) > 0);
    if (!valid.length) return { startYear: null, endYear: null, totalYears: 0, items: [], ticks: [] };
    const startYear = Math.min(...valid.map(segment => Number(segment.fromYear)));
    const endYear = Math.max(...valid.map(segment => Number(segment.toYear) || Number(currentYear) || Number(segment.fromYear)));
    const totalYears = Math.max(1, endYear - startYear + 1);
    const items = valid.map(segment => {
      const fromYear = Number(segment.fromYear), toYear = Number(segment.toYear) || endYear;
      return { ...segment, column: fromYear - startYear + 1, span: Math.max(1, toYear - fromYear + 1) };
    });
    const ticks = [...new Set(items.map(segment => segment.fromYear))].map((year, index) => ({
      year, change: index > 0, position: (Number(year) - startYear) / totalYears * 100
    }));
    return { startYear, endYear, totalYears, items, ticks };
  }
  return { action, chart, continuity, years, transition };
}));
