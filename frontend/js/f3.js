async function loadF3Dashboard() {
  try {
    const data = await getJSON('/api/dashboard?series=f3');
    const values = [data.seasons, data.drivers, data.constructors, data.circuits];
    document.querySelectorAll('#f3-stats .metric strong').forEach((element, index) => {
      element.textContent = fmtNumber(values[index]);
    });
    const latestLink = document.getElementById('latest-f3-season-link');
    if (latestLink && data.latestSeason) latestLink.textContent = `Latest season · ${data.latestSeason}`;
  } catch (error) {
    console.error('F3 dashboard error:', error);
  }
}

loadF3Dashboard();
