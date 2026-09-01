let allSeasons = [];
let seasonPage = 1;
const SEASON_PAGE_SIZE = 16;
const seasonSeries = activeSeriesKey();
const seasonBase = seasonSeries === 'f1' ? '' : `/${seasonSeries}`;
const seasonChampionLabel = { f1: 'World champion', f2: 'F2 champion', f3: 'F3 champion', academy: 'F1 Academy champion' }[seasonSeries];


async function loadSeasons() {

    const container = document.getElementById('seasons');

    if (!container) {
        return;
    }

    try {

        allSeasons = await getJSON(`/api/seasons${seasonBase ? `?series=${seasonSeries}` : ''}`);

        populateSeasonSearch();

        renderSeasons(matchingSeasons());

    } catch (error) {

        console.error(error);

        setError(
            'seasons',
            error.message
        );
    }
}


function populateSeasonSearch() {

    const list = document.getElementById('season-years');

    if (list) {
        list.innerHTML = allSeasons.map(season =>
            `<option value="${esc(season.year)}"></option>`
        ).join('');
    }
}


function matchingSeasons() {

    const query = document.getElementById('season-search')?.value.trim() || '';

    const filtered = query
        ? allSeasons.filter(season => String(season.year).includes(query))
        : allSeasons;

    const direction = document.getElementById('season-sort')?.value === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => direction * (Number(a.year) - Number(b.year)));
}


function championNameMarkup(champion) {
    if (!champion?.name) return 'To be decided';

    // Prefer recorded name parts, including compound given names. Some junior
    // records only contain a display name; keep all words after the first together.
    const fallback = champion.name.trim().match(/^(\S+)\s+(.+)$/);
    const firstName = champion.firstName && champion.lastName ? champion.firstName : fallback?.[1];
    const lastName = champion.firstName && champion.lastName ? champion.lastName : fallback?.[2];
    if (!firstName || !lastName) return esc(champion.name);

    return `<span class="champion-first-name">${esc(firstName)}</span> <span class="champion-last-name">${esc(lastName)}</span>`;
}


function renderSeasons(seasons) {

    const container = document.getElementById('seasons');

    if (!seasons.length) {

        container.innerHTML = `
            <div class="error">
                No season matches that search.
            </div>
        `;

        renderPagination('seasons', 0, 1, SEASON_PAGE_SIZE, () => {});

        return;
    }


    const paged = pageItems(seasons, seasonPage, SEASON_PAGE_SIZE);
    seasonPage = paged.page;
    container.innerHTML = paged.items.map(season => {

        const races =
            Number(season.raceCount || 0);

        const drivers =
            Number(season.driverCount || 0);

        const constructors =
            Number(season.constructorCount || 0);


        return `
            <a
                class="season-card"
                href="${seasonBase}/season?year=${encodeURIComponent(season.year)}"
            >

                <div class="season-card-heading">
                    <div class="season-year">
                        ${esc(season.year)}
                    </div>

                    <div class="season-card-champion${season.champion?.name ? ' has-champion' : ''}">
                        <span>${seasonChampionLabel}</span>
                        <strong>${championNameMarkup(season.champion)}</strong>
                    </div>
                </div>

                <div class="season-details">

                    <div class="season-stat">
                        <span>${seasonSeries === 'f1' ? 'Races' : 'Rounds'}</span>
                        <strong>${fmtNumber(races)}</strong>
                    </div>

                    <div class="season-stat">
                        <span>Drivers</span>
                        <strong>${fmtNumber(drivers)}</strong>
                    </div>

                    <div class="season-stat">
                        <span>${seasonSeries === 'f1' ? 'Constructors' : 'Teams'}</span>
                        <strong>${fmtNumber(constructors)}</strong>
                    </div>

                </div>

            </a>
        `;

    }).join('');
    renderPagination('seasons', seasons.length, seasonPage, SEASON_PAGE_SIZE, page => { seasonPage = page; renderSeasons(seasons); container.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}


function refreshSeasons() {
    seasonPage = 1;
    renderSeasons(matchingSeasons());
}

document.getElementById('season-search')?.addEventListener('input', refreshSeasons);
document.getElementById('season-sort')?.addEventListener('change', refreshSeasons);


loadSeasons();
