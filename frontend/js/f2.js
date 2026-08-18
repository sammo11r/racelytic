async function loadF2Dashboard() {
  try {
    const data = await getJSON('/api/dashboard?series=f2');
    const values = [data.seasons, data.drivers, data.constructors, data.circuits];
    document.querySelectorAll('#f2-stats .metric strong').forEach((element, index) => {
      element.textContent = fmtNumber(values[index]);
    });
    const latestLink = document.getElementById('latest-f2-season-link');
    if (latestLink && data.latestSeason) {
      latestLink.textContent = `Latest season · ${data.latestSeason}`;
    }
  } catch (error) {
    console.error('F2 dashboard error:', error);
  }
}

loadF2Dashboard();
