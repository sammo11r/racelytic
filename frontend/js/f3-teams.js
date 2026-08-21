let allF3Teams = [];
let f3TeamPage = 1;
const F3_TEAM_PAGE_SIZE = 24;

function f3TeamCountryName(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || String(code).toUpperCase();
  } catch {
    return String(code).toUpperCase();
  }
}

function f3TeamFlag(team) {
  const code = String(team.countryCode || '').toLowerCase();
  return code ? `<img class="driver-card-flag" src="/assets/flags/${encodeURIComponent(code)}.svg" alt="${esc(f3TeamCountryName(code))} flag" loading="lazy">` : '';
}

function renderF3Teams() {
  const search = document.getElementById('f3-team-search').value.toLowerCase().trim();
  const sort = document.getElementById('f3-team-sort').value;
  const teams = allF3Teams
    .filter(team => `${team.name} ${team.abbreviation || ''} ${f3TeamCountryName(team.countryCode)}`.toLowerCase().includes(search))
    .sort((first, second) => {
      if (sort === 'name') return first.name.localeCompare(second.name);
      if (sort === 'wins') return Number(second.totalRaceWins || 0) - Number(first.totalRaceWins || 0) || first.name.localeCompare(second.name);
      if (sort === 'titles') return Number(second.totalChampionshipWins || 0) - Number(first.totalChampionshipWins || 0) || first.name.localeCompare(second.name);
      return Number(second.lastYear || 0) - Number(first.lastYear || 0) || Number(first.latestPosition || 999) - Number(second.latestPosition || 999);
    });
  const paged = pageItems(teams, f3TeamPage, F3_TEAM_PAGE_SIZE);
  f3TeamPage = paged.page;
  document.getElementById('f3-team-count').textContent = `${fmtNumber(teams.length)} team${teams.length === 1 ? '' : 's'}`;
  document.getElementById('f3-teams').innerHTML = paged.items.map(team => `
    <a class="entity-card f2-driver-card" href="/f3/team?id=${encodeURIComponent(team.id)}">
      <div class="driver-card-name"><h3>${esc(team.name)}</h3>${f3TeamFlag(team)}</div>
      <p>${esc(team.abbreviation || 'F3 team')} · ${esc(f3TeamCountryName(team.countryCode))} · ${team.firstYear ? `${esc(team.firstYear)}${team.lastYear !== team.firstYear ? `–${esc(team.lastYear)}` : ''}` : 'Seasons unavailable'}</p>
      <div class="f2-driver-card-record"><span><strong>${fmtNumber(team.totalRaceWins)}</strong> wins</span><span><strong>${fmtNumber(team.totalPodiums)}</strong> podiums</span><span><strong>${fmtNumber(team.totalChampionshipWins)}</strong> titles</span></div>
      ${Number(team.totalChampionshipWins || 0) > 0 ? '<em class="f2-driver-title">F3 team champion</em>' : ''}
    </a>`).join('');
  renderPagination('f3-teams', teams.length, f3TeamPage, F3_TEAM_PAGE_SIZE, page => { f3TeamPage = page; renderF3Teams(); document.getElementById('f3-teams').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

async function loadF3Teams() {
  try {
    allF3Teams = await getJSON('/api/constructors?series=f3');
    renderF3Teams();
  } catch (error) {
    setError('f3-teams', error.message);
  }
}

['f3-team-search', 'f3-team-sort'].forEach(id => document.getElementById(id).addEventListener(id.endsWith('search') ? 'input' : 'change', () => { f3TeamPage = 1; renderF3Teams(); }));
loadF3Teams();
