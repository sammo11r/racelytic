async function loadSeriesHome() {
  const series = document.body.dataset.seriesHome || 'f1';
  const base = series === 'f1' ? '' : series === 'fe' ? '/formula-e' : `/${series}`;

  try {
    const data = await getJSON(`/api/dashboard?series=${encodeURIComponent(series)}`);
    const values = [data.seasons, data.drivers, data.constructors, data.circuits];
    document.querySelectorAll('#series-stats .metric strong').forEach((element, index) => {
      element.textContent = fmtNumber(values[index]);
    });

    const seasonUrl = `${base}/seasons/${encodeURIComponent(data.latestSeason)}`;
    const latestSeasonLink = document.getElementById('latest-season-link');
    const snapshotSeasonLink = document.getElementById('snapshot-season-link');
    if (latestSeasonLink) {
      latestSeasonLink.href = seasonUrl;
      latestSeasonLink.textContent = `Latest season · ${data.latestSeason}`;
    }
    const seasonLabel = data.latestSeasonLabel || data.latestSeason;
    const rounds = Number(data.currentSeason?.rounds || 0);
    snapshotSeasonLink.href = seasonUrl;
    document.getElementById('snapshot-season').textContent = seasonLabel;
    document.getElementById('snapshot-season-label').textContent = data.currentSeason?.nextEvent ? 'Current season' : 'Latest season';
    document.getElementById('snapshot-rounds').textContent = fmtNumber(rounds);
    const leader = data.currentSeason?.leader;
    if (leader) {
      document.getElementById('snapshot-leader').textContent = leader.name;
      document.getElementById('snapshot-leader-label').textContent = leader.label
        || (leader.championshipWon ? 'Drivers’ champion' : 'Drivers’ leader');
      document.getElementById('snapshot-leader-points').textContent = `${fmtNumber(leader.points)} pts`;
    }

    if (series !== 'wec') {
      const standings = data.currentSeason?.topDrivers || [];
      for (const [index, nameId, pointsId] of [[1, 'snapshot-runner-up', 'snapshot-runner-up-points'], [2, 'snapshot-third', 'snapshot-third-points']]) {
        if (!standings[index]) continue;
        document.getElementById(nameId).textContent = standings[index].name;
        document.getElementById(pointsId).textContent = `${fmtNumber(standings[index].points)} pts`;
      }
    }
    const constructor = series === 'wec' ? data.currentSeason?.manufacturerLeader : data.currentSeason?.constructorLeader;
    if (constructor) {
      document.getElementById('snapshot-constructor').textContent = constructor.name;
      document.getElementById('snapshot-constructor-points').textContent = `${fmtNumber(constructor.points)} pts`;
      document.getElementById('snapshot-constructor-label').textContent = series === 'wec'
        ? constructor.championshipWon ? 'Hypercar manufacturers’ champions' : 'Hypercar manufacturers’ leader'
        : series === 'f1'
          ? constructor.championshipWon ? 'Constructors’ champion' : 'Constructors’ leader'
          : constructor.championshipWon ? 'Teams’ champion' : 'Teams’ leader';
    }
    document.getElementById('snapshot-completed-races').textContent = fmtNumber(data.currentSeason?.completedRaces || 0);
    const event = data.currentSeason?.nextEvent || data.currentSeason?.latestEvent;
    if (event) {
      const isNext = Boolean(data.currentSeason?.nextEvent);
      document.getElementById('snapshot-event-label').textContent = series === 'wec'
        ? isNext ? 'Next event' : 'Final event'
        : series === 'fe' ? isNext ? 'Next E-Prix' : 'Final E-Prix'
          : isNext ? 'Next race' : 'Final race';
      document.getElementById('snapshot-event').textContent = event.name;
      document.getElementById('snapshot-event-meta').textContent = `Round ${fmtNumber(event.round)} · ${fmtDate(event.date)}`;
      document.getElementById('snapshot-event-link').href = resourceUrl('race', event.id, { base, label: displayRaceName(event) });
    }
  } catch (error) {
    console.error('Series landing page error:', error);
  }
}

const homeAskQuery = document.getElementById('home-ask-query');
if (homeAskQuery) {
  const exampleQuestion = homeAskQuery.value;
  let showingExample = true;
  homeAskQuery.addEventListener('focus', () => {
    if (!showingExample) return;
    homeAskQuery.value = '';
    showingExample = false;
  });
  homeAskQuery.addEventListener('blur', () => {
    if (homeAskQuery.value.trim()) return;
    homeAskQuery.value = exampleQuestion;
    showingExample = true;
  });
}

loadSeriesHome();
