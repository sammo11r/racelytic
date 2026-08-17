async function loadDashboard() {
  try {
    const data = await getJSON('/api/dashboard');
    const values = [data.seasons, data.drivers, data.constructors, data.circuits];
    document.querySelectorAll('#stats .metric strong').forEach((el, i) => el.textContent = fmtNumber(values[i]));
    const link = document.getElementById('latest-season-link');
    if (link) link.href = `/season?year=${data.latestSeason}`;
  } catch (error) {
    console.error(error);
  }
}
loadDashboard();
