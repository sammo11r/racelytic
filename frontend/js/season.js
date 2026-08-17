(() => {

    'use strict';

    // ========================================================
    // Season
    // ========================================================

    const query =
        new URLSearchParams(window.location.search);

    const year =
        Number(query.get('year'));

    let standingsMode = 'points';


    // ========================================================
    // Helpers
    // ========================================================

    function get(id) {
        return document.getElementById(id);
    }


    function formatNumber(value) {

        const number = Number(value);

        if (!Number.isFinite(number)) {
            return '0';
        }

        return number.toLocaleString('en-US');
    }


    function escapeHtml(value) {

        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }


    function formatDate(value) {

        if (!value) {
            return '';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }


    function raceCode(race) {

        if (race.grandPrixId) {

            const words = String(race.grandPrixId)
                .split(/[-_\s]+/)
                .filter(Boolean);

            if (words.length === 1) {
                return words[0]
                    .substring(0, 3)
                    .toUpperCase();
            }

            return words
                .slice(0, 3)
                .map(word => word.charAt(0))
                .join('')
                .toUpperCase();
        }

        return `R${race.round}`;
    }


    function driverResult(driver, round) {
        return driver.raceResults?.[String(round)] ??
            driver.raceResults?.[round] ??
            null;
    }


    function resultClass(result) {
        if (!result) return 'result-empty';
        const text = String(result.positionText || '').toUpperCase();
        if (!result.position || /RET|DNS|DNQ|DSQ|WD|NC/.test(text)) return 'result-retired';
        if (result.position === 1) return 'result-win';
        if (result.position <= 3) return 'result-podium';
        if (Number(result.points) > 0) return 'result-points';
        return 'result-finish';
    }


    function resultLabel(result) {
        if (!result) return '—';
        return result.positionText || result.position || result.sprintPositionText || '—';
    }


    function resultPoints(result) {
        if (!result) return '';
        const points = Number(result.points || 0);
        return points > 0 ? formatNumber(points) : '';
    }


    function sprintPoints(result) {
        const points = Number(result?.sprintPoints || 0);
        if (points <= 0) return '';
        return `<sub class="sprint-points" title="${formatNumber(points)} sprint points">${formatNumber(points)}</sub>`;
    }


    function constructorResult(constructor, round) {
        return constructor.raceResults?.[String(round)] ??
            constructor.raceResults?.[round] ??
            null;
    }


    function resultMarkers(result) {
        if (!result) return '';
        const markers = [];
        if (result.fastestLap) markers.push(['F', 'Fastest lap']);
        if (result.polePosition) markers.push(['P', 'Pole position']);
        return markers.map(([marker, label]) =>
            `<sup class="result-marker" title="${escapeHtml(label)}">${marker}</sup>`
        ).join('');
    }


    function setStandingsMode(mode) {
        standingsMode = mode === 'position' ? 'position' : 'points';

        document.querySelectorAll('[data-standings-mode]').forEach(button => {
            const active = button.dataset.standingsMode === standingsMode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        const table = get('driver-table');
        if (table) table.dataset.valueMode = standingsMode;

        document.querySelectorAll('#driver-table .result-value').forEach(value => {
            value.textContent = standingsMode === 'position'
                ? value.dataset.position
                : value.dataset.points;
        });
    }


    // ========================================================
    // Load
    // ========================================================

    async function loadSeason() {

        console.log(
            `Loading season ${year}...`
        );


        if (!year) {

            showError(
                'No season specified.'
            );

            return;
        }


        try {

            const response = await fetch(
                `/api/seasons/${encodeURIComponent(year)}`
            );


            if (!response.ok) {

                throw new Error(
                    `API returned ${response.status}`
                );
            }


            const data =
                await response.json();


            console.log(
                'Racelytic season data:',
                data
            );


            renderSeason(data);

        } catch (error) {

            console.error(
                'Season error:',
                error
            );

            showError(
                error.message
            );
        }
    }


    // ========================================================
    // Render season
    // ========================================================

    function renderSeason(data) {

        console.log(
            'Rendering season:',
            data.year
        );


        // ----------------------------------------------------
        // Header
        // ----------------------------------------------------

        const yearElement =
            get('season-year');

        if (yearElement) {
            yearElement.textContent =
                data.year;
        }


        const subtitleElement =
            get('season-subtitle');

        if (subtitleElement) {
            subtitleElement.textContent =
                'Formula 1 World Championship';
        }


        // ----------------------------------------------------
        // Summary
        // ----------------------------------------------------

        renderSummary(
            data.summary
        );


        // ----------------------------------------------------
        // Driver table
        // ----------------------------------------------------

        renderDriverTable(
            data.calendar,
            data.driverChampionship
        );


        // ----------------------------------------------------
        // Constructor table
        // ----------------------------------------------------

        renderConstructorTable(
            data.calendar,
            data.constructorChampionship
        );


        // ----------------------------------------------------
        // Calendar
        // ----------------------------------------------------

        renderCalendar(
            data.calendar
        );

        renderSeasonMap(
            data.calendar
        );


        console.log(
            'Season rendering complete.'
        );
    }


    // ========================================================
    // Summary
    // ========================================================

    function renderSummary(summary) {

        if (!summary) {
            return;
        }


        const races =
            get('season-races');

        if (races) {
            races.textContent =
                formatNumber(summary.races);
        }


        const laps =
            get('season-laps');

        if (laps) {
            laps.textContent =
                formatNumber(summary.laps);
        }


        setPodium(
            'first',
            summary.first
        );

        setPodium(
            'second',
            summary.second
        );

        setPodium(
            'third',
            summary.third
        );
    }


    function setPodium(
        position,
        driver
    ) {

        const name =
            get(`season-${position}`);

        const points =
            get(`season-${position}-points`);


        if (!driver) {

            if (name) {
                name.textContent = '—';
            }

            if (points) {
                points.textContent = '';
            }

            return;
        }


        if (name) {
            name.textContent =
                driver.name;
        }


        if (points) {
            points.textContent =
                `${formatNumber(driver.points)} pts`;
        }
    }


    // ========================================================
    // Driver table
    // ========================================================

    function renderDriverTable(
        races,
        drivers
    ) {

        console.log(
            'Rendering driver table:',
            drivers.length,
            'drivers /',
            races.length,
            'races'
        );


        const head =
            get('driver-table-head');

        const body =
            get('driver-table-body');


        if (!head || !body) {

            console.error(
                'Driver table elements missing.'
            );

            return;
        }


        // ----------------------------------------------------
        // Header
        // ----------------------------------------------------

        let header = `
            <tr>
                <th class="position-column">
                    Pos.
                </th>

                <th class="name-column">
                    Driver
                </th>
        `;


        for (const race of races) {

            header += `
                <th
                    class="race-column"
                    title="${escapeHtml(
                        race.officialName
                    )}"
                >
                    ${escapeHtml(
                        raceCode(race)
                    )}
                </th>
            `;
        }


        header += `
                <th class="points-column">
                    Points
                </th>
            </tr>
        `;


        head.innerHTML =
            header;


        // ----------------------------------------------------
        // Rows
        // ----------------------------------------------------

        let rows = '';


        for (const driver of drivers) {

            const leader =
                Number(driver.position) === 1
                    ? 'championship-leader'
                    : '';


            rows += `
                <tr class="${leader}">

                    <td class="position-column">
                        ${escapeHtml(
                            driver.position
                        )}
                    </td>

                    <td class="name-column">

                        <a
                            href="/driver?id=${encodeURIComponent(
                                driver.driverId
                            )}"
                        >
                            <span class="driver-name">
                                ${escapeHtml(
                                    driver.name
                                )}
                            </span>
                        </a>

                    </td>
            `;


            for (const race of races) {
                const result = driverResult(driver, race.round);
                rows += `
                    <td
                        class="race-point ${resultClass(result)}"
                        title="${escapeHtml(race.officialName)}: finished ${escapeHtml(resultLabel(result))}, ${escapeHtml(resultPoints(result) || '0')} race points${Number(result?.sprintPoints || 0) > 0 ? `, ${formatNumber(result.sprintPoints)} sprint points` : ''}"
                    >
                        <span
                            class="result-value"
                            data-points="${escapeHtml(resultPoints(result))}"
                            data-position="${escapeHtml(resultLabel(result))}"
                        >${escapeHtml(resultPoints(result))}</span>${sprintPoints(result)}${resultMarkers(result)}
                    </td>
                `;
            }


            rows += `
                    <td class="points-column total-points">
                        ${formatNumber(
                            driver.points
                        )}
                    </td>

                </tr>
            `;
        }


        body.innerHTML =
            rows;

        setStandingsMode(standingsMode);


        console.log(
            'Driver table rendered:',
            body.rows.length,
            'rows'
        );
    }


    // ========================================================
    // Constructor table
    // ========================================================

    function renderConstructorTable(
        races,
        constructors
    ) {

        console.log(
            'Rendering constructor table:',
            constructors.length,
            'constructors /',
            races.length,
            'races'
        );


        const head =
            get('constructor-table-head');

        const body =
            get('constructor-table-body');


        if (!head || !body) {

            console.error(
                'Constructor table elements missing.'
            );

            return;
        }


        // ----------------------------------------------------
        // Header
        // ----------------------------------------------------

        let header = `
            <tr>

                <th class="position-column">
                    Pos.
                </th>

                <th class="name-column">
                    Constructor
                </th>
        `;


        for (const race of races) {

            header += `
                <th
                    class="race-column"
                    title="${escapeHtml(
                        race.officialName
                    )}"
                >
                    ${escapeHtml(
                        raceCode(race)
                    )}
                </th>
            `;
        }


        header += `
                <th class="points-column">
                    Points
                </th>

            </tr>
        `;


        head.innerHTML =
            header;


        // ----------------------------------------------------
        // Rows
        // ----------------------------------------------------

        let rows = '';


        for (const constructor of constructors) {

            const leader =
                Number(constructor.position) === 1
                    ? 'championship-leader'
                    : '';


            rows += `
                <tr class="${leader}">

                    <td class="position-column">
                        ${escapeHtml(
                            constructor.position
                        )}
                    </td>

                    <td class="name-column">

                        <a
                            href="/constructor?id=${encodeURIComponent(
                                constructor.constructorId
                            )}"
                        >
                            ${escapeHtml(
                                constructor.name
                            )}
                        </a>

                    </td>
            `;


            for (const race of races) {

                const result = constructorResult(constructor, race.round);
                const points = Number(result?.points || 0);


                rows += `
                    <td
                        class="race-point constructor-points ${
                            points > 0
                                ? 'has-points'
                                : ''
                        }"
                    >
                        <span>${points > 0 ? formatNumber(points) : ''}</span>${sprintPoints(result)}
                    </td>
                `;
            }


            rows += `
                    <td class="points-column total-points">
                        ${formatNumber(
                            constructor.points
                        )}
                    </td>

                </tr>
            `;
        }


        body.innerHTML =
            rows;


        console.log(
            'Constructor table rendered:',
            body.rows.length,
            'rows'
        );
    }


    // ========================================================
    // Calendar
    // ========================================================

    function renderCalendar(races) {

        console.log(
            'Rendering calendar:',
            races.length,
            'races'
        );


        const container =
            get('race-calendar');


        if (!container) {
            return;
        }


        let html = '';


        for (const race of races) {

            html += `
                <a
                    class="calendar-race"
                    data-round="${escapeHtml(race.round)}"
                    href="/race?id=${encodeURIComponent(
                        race.id
                    )}"
                >

                    <div class="calendar-round">
                        ${String(
                            race.round
                        ).padStart(2, '0')}
                    </div>

                    <div class="calendar-date">
                        ${escapeHtml(
                            formatDate(race.date)
                        )}
                    </div>

                    <div class="calendar-name">

                        <strong>
                            ${escapeHtml(
                                race.officialName ||
                                'Grand Prix'
                            )}
                        </strong>

                        <span>
                            ${escapeHtml(
                                race.circuitName ||
                                ''
                            )}
                        </span>

                    </div>

                    <div class="calendar-laps">

                        <span>
                            ${formatNumber(
                                race.laps
                            )}
                        </span>

                        <small>
                            laps
                        </small>

                    </div>

                </a>
            `;
        }


        container.innerHTML =
            html;


        console.log(
            'Calendar rendered:',
            container.children.length,
            'races'
        );
    }


    // ========================================================
    // Calendar map
    // ========================================================

    async function renderSeasonMap(races) {
        const container = get('season-map');
        const mappedRaces = races.filter(race =>
            Number.isFinite(Number(race.latitude)) &&
            Number.isFinite(Number(race.longitude))
        );

        if (!container || !window.d3 || !window.topojson || !mappedRaces.length) {
            if (container) container.innerHTML = '<div class="season-map-loading">Map data unavailable.</div>';
            return;
        }

        try {
            const response = await fetch('/data/countries-110m.json');
            if (!response.ok) throw new Error('World map could not be loaded.');
            const world = await response.json();
            const countries = window.topojson.feature(world, world.objects.countries);

            container.innerHTML = `
                <svg class="season-map-svg" role="img" aria-label="World map showing the ${year} Formula 1 calendar route"></svg>
                <div class="season-map-tooltip" role="status" aria-live="polite"></div>
            `;

            const svg = window.d3.select(container).select('svg');
            const tooltip = container.querySelector('.season-map-tooltip');

            const draw = () => {
                const width = Math.max(container.clientWidth, 320);
                const height = Math.max(310, Math.min(520, width * 0.46));
                const projection = window.d3.geoNaturalEarth1().fitExtent(
                    [[18, 18], [width - 18, height - 18]],
                    { type: 'Sphere' }
                );
                const path = window.d3.geoPath(projection);
                const coordinates = mappedRaces.map(race => [Number(race.longitude), Number(race.latitude)]);

                svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove();
                svg.append('path').datum({ type: 'Sphere' }).attr('class', 'map-ocean').attr('d', path);
                svg.append('g').selectAll('path').data(countries.features).join('path')
                    .attr('class', 'map-country').attr('d', path);
                svg.append('path').datum({ type: 'LineString', coordinates })
                    .attr('class', 'calendar-route').attr('d', path);

                const stops = svg.append('g').selectAll('g').data(mappedRaces).join('g')
                    .attr('class', 'calendar-stop')
                    .attr('role', 'button')
                    .attr('tabindex', 0)
                    .attr('aria-label', race => `Round ${race.round}: ${race.officialName}`)
                    .attr('transform', race => `translate(${projection([Number(race.longitude), Number(race.latitude)])})`);

                stops.append('circle').attr('r', 8);
                stops.append('text').attr('text-anchor', 'middle').attr('dy', '.34em')
                    .text(race => race.round);

                const activate = (event, race) => {
                    const bounds = container.getBoundingClientRect();
                    const point = window.d3.pointer(event, container);
                    tooltip.innerHTML = `<strong>Round ${escapeHtml(race.round)}</strong><span>${escapeHtml(race.officialName)}</span><small>${escapeHtml(race.circuitName || '')} · ${escapeHtml(formatDate(race.date))}</small>`;
                    tooltip.style.left = `${Math.min(point[0] + 14, bounds.width - 235)}px`;
                    tooltip.style.top = `${Math.max(point[1] - 35, 10)}px`;
                    tooltip.classList.add('visible');
                    document.querySelectorAll('.calendar-race.map-active').forEach(card => card.classList.remove('map-active'));
                    document.querySelector(`.calendar-race[data-round="${race.round}"]`)?.classList.add('map-active');
                };

                stops.on('mouseenter focus', activate)
                    .on('mouseleave blur', () => tooltip.classList.remove('visible'))
                    .on('click keydown', (event, race) => {
                        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
                        if (event.type === 'keydown') event.preventDefault();
                        document.querySelector(`.calendar-race[data-round="${race.round}"]`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
            };

            draw();
            new ResizeObserver(draw).observe(container);
        } catch (error) {
            console.error('Calendar map error:', error);
            container.innerHTML = `<div class="season-map-loading">${escapeHtml(error.message)}</div>`;
        }
    }


    // ========================================================
    // Error
    // ========================================================

    function showError(message) {

        const element =
            get('season-error');


        if (element) {
            element.textContent =
                message;
        }
    }


    // ========================================================
    // Start
    // ========================================================

    document.querySelectorAll('[data-standings-mode]').forEach(button => {
        button.addEventListener('click', () => setStandingsMode(button.dataset.standingsMode));
    });

    loadSeason();

})();
