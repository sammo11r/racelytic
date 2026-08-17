let allSeasons = [];
let seasonPage = 1;
const SEASON_PAGE_SIZE = 16;


async function loadSeasons() {

    const container = document.getElementById('seasons');

    if (!container) {
        return;
    }

    try {

        allSeasons = await getJSON('/api/seasons');

        populateSeasonSearch();

        renderSeasons(allSeasons);

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

    return query
        ? allSeasons.filter(season => String(season.year).includes(query))
        : allSeasons;
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
                href="/season.html?year=${encodeURIComponent(season.year)}"
            >

                <div class="season-card-heading">
                    <div class="season-year">
                        ${esc(season.year)}
                    </div>

                    <div class="season-card-champion">
                        World champion: <strong>${esc(season.champion?.name || 'Not awarded')}</strong>
                    </div>
                </div>

                <div class="season-details">

                    <div class="season-stat">
                        <span>Races</span>
                        <strong>${fmtNumber(races)}</strong>
                    </div>

                    <div class="season-stat">
                        <span>Drivers</span>
                        <strong>${fmtNumber(drivers)}</strong>
                    </div>

                    <div class="season-stat">
                        <span>Constructors</span>
                        <strong>${fmtNumber(constructors)}</strong>
                    </div>

                </div>

            </a>
        `;

    }).join('');
    renderPagination('seasons', seasons.length, seasonPage, SEASON_PAGE_SIZE, page => { seasonPage = page; renderSeasons(seasons); container.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}


document.getElementById('season-search')?.addEventListener('input', () => {
    seasonPage = 1;
    document.getElementById('season-search-message').textContent = '';
    renderSeasons(matchingSeasons());
});


document.getElementById('season-jump')?.addEventListener('submit', event => {
    event.preventDefault();

    const input = document.getElementById('season-search');
    const message = document.getElementById('season-search-message');
    const year = input.value.trim();
    const season = allSeasons.find(item => String(item.year) === year);

    if (season) {
        window.location.href = `/season.html?year=${encodeURIComponent(season.year)}`;
        return;
    }

    message.textContent = year
        ? 'Enter a complete year from the archive.'
        : 'Enter a season year to open it.';
});


loadSeasons();
