(async function loadArchiveCounts() {
  try {
    const series = activeSeriesKey();
    const endpoint = series === 'wec'
      ? '/api/wec/database'
      : `/api/dashboard?series=${encodeURIComponent(series)}&archive=1`;
    const data = await getJSON(endpoint);
    document.querySelectorAll('[data-archive-count]').forEach(element => {
      const value = data[element.dataset.archiveCount];
      if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return;
      element.textContent = fmtNumber(value);
      const label = element.previousElementSibling?.textContent.toLowerCase() || element.dataset.archiveCount;
      element.setAttribute('aria-label', `${fmtNumber(value)} ${label} in the archive`);
    });
  } catch (error) {
    // Counts are supplementary; archive navigation stays usable when unavailable.
    console.error('Archive counts unavailable:', error);
  }
})();
