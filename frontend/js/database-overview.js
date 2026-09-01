(async function loadArchiveCounts() {
  try {
    const data = await getJSON(`/api/dashboard?series=${encodeURIComponent(activeSeriesKey())}&archive=1`);
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
