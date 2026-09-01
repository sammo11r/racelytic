async function loadSeriesHome() {
  const series = document.body.dataset.seriesHome || 'f1';
  const base = series === 'f1' ? '' : `/${series}`;

  try {
    const data = await getJSON(`/api/dashboard?series=${encodeURIComponent(series)}`);
    const values = [data.seasons, data.drivers, data.constructors, data.circuits];
    document.querySelectorAll('#series-stats .metric strong').forEach((element, index) => {
      element.textContent = fmtNumber(values[index]);
    });

    const seasonUrl = `${base}/season?year=${encodeURIComponent(data.latestSeason)}`;
    const latestSeasonLink = document.getElementById('latest-season-link');
    const snapshotSeasonLink = document.getElementById('snapshot-season-link');
    if (latestSeasonLink) {
      latestSeasonLink.href = seasonUrl;
      latestSeasonLink.textContent = `Latest season · ${data.latestSeason}`;
    }
    snapshotSeasonLink.href = seasonUrl;
    document.getElementById('snapshot-season').textContent = data.latestSeason;
    document.getElementById('snapshot-rounds').textContent = fmtNumber(data.currentSeason?.rounds || 0);

    const leader = data.currentSeason?.leader;
    if (leader) {
      document.getElementById('snapshot-leader').textContent = leader.name;
      document.getElementById('snapshot-leader-label').textContent = leader.championshipWon ? 'Champion' : 'Championship leader';
      document.getElementById('snapshot-leader-points').textContent = `${fmtNumber(leader.points)} points`;
    }

    const event = data.currentSeason?.latestEvent || data.currentSeason?.nextEvent;
    if (event) {
      const isNext = !data.currentSeason.latestEvent;
      document.getElementById('snapshot-event-label').textContent = isNext ? 'Next event' : 'Latest event';
      document.getElementById('snapshot-event').textContent = event.name;
      document.getElementById('snapshot-event-meta').textContent = `Round ${fmtNumber(event.round)} · ${fmtDate(event.date)}`;
      document.getElementById('snapshot-event-link').href = `${base}/race?id=${encodeURIComponent(event.id)}`;
    }
  } catch (error) {
    console.error('Series landing page error:', error);
  }
}

loadSeriesHome();
