async function loadHeader() {
    const container = document.getElementById('header');

    if (!container) {
        return;
    }

    try {
        const response = await fetch('/components/header.html');

        if (!response.ok) {
            throw new Error('Failed to load header');
        }

        container.innerHTML = await response.text();

        const requestedSeries = new URLSearchParams(window.location.search).get('series');
        let rememberedSeries = '';
        try { rememberedSeries = localStorage.getItem('racelytic-series') || ''; } catch {}
        const seriesNeutralPages = ['/account', '/privacy', '/terms'];
        const isSeriesNeutralPage = seriesNeutralPages.includes(window.location.pathname);
        const pathSeries = window.location.pathname === '/academy' || window.location.pathname.startsWith('/academy/')
            ? 'academy'
            : window.location.pathname === '/f3' || window.location.pathname.startsWith('/f3/')
            ? 'f3'
            : window.location.pathname === '/f2' || window.location.pathname.startsWith('/f2/') ? 'f2' : 'f1';
        const neutralSeries = ['f1', 'f2', 'f3', 'academy'].includes(requestedSeries)
            ? requestedSeries
            : ['f1', 'f2', 'f3', 'academy'].includes(rememberedSeries) ? rememberedSeries : 'f1';
        const activeSeries = isSeriesNeutralPage ? neutralSeries : pathSeries;
        const isF2Mode = activeSeries === 'f2';
        const isF3Mode = activeSeries === 'f3';
        const isAcademyMode = activeSeries === 'academy';
        try { localStorage.setItem('racelytic-series', activeSeries); } catch {}

        const academyContentLinkMap = {
            '/analysis': '/academy/analysis', '/season': '/academy/season', '/race': '/academy/race',
            '/f2/analysis': '/academy/analysis', '/f3/analysis': '/academy/analysis',
            '/driver': '/academy/driver', '/f3/driver': '/academy/driver', '/constructor': '/academy/team', '/f3/team': '/academy/team', '/circuit': '/academy/circuit',
            '/season-analysis': '/academy/season-analysis', '/season-comparison': '/academy/season-comparison',
            '/race-analysis': '/academy/race-analysis', '/driver-comparison': '/academy/driver-comparison',
            '/driver-form': '/academy/driver-form', '/teammate-battles': '/academy/teammate-battles',
            '/circuit-analysis': '/academy/circuit-analysis', '/records': '/academy/records',
            '/championship-builder': '/academy/championship-builder', '/points-systems': '/academy/points-systems'
        };
        const contentLinkMap = isAcademyMode ? academyContentLinkMap : activeSeries === 'f3' ? {
            '/analysis': '/f3/analysis', '/season': '/f3/season', '/race': '/f3/race',
            '/f2/analysis': '/f3/analysis',
            '/driver': '/f3/driver', '/constructor': '/f3/team', '/circuit': '/f3/circuit',
            '/season-analysis': '/f3/season-analysis', '/season-comparison': '/f3/season-comparison',
            '/race-analysis': '/f3/race-analysis', '/driver-comparison': '/f3/driver-comparison',
            '/driver-form': '/f3/driver-form', '/teammate-battles': '/f3/teammate-battles',
            '/circuit-analysis': '/f3/circuit-analysis', '/records': '/f3/records',
            '/championship-builder': '/f3/championship-builder', '/points-systems': '/f3/points-systems'
        } : activeSeries === 'f2' ? {
            '/analysis': '/f2/analysis', '/season': '/f2/season', '/race': '/f2/race',
            '/driver': '/f2/driver', '/constructor': '/f2/constructor', '/circuit': '/f2/circuit'
        } : {};
        const rewriteContentLinks = root => root?.querySelectorAll?.('a[href]').forEach(link => {
            const url = new URL(link.href, window.location.origin);
            if (url.origin !== window.location.origin || !contentLinkMap[url.pathname]) return;
            link.href = `${contentLinkMap[url.pathname]}${url.search}${url.hash}`;
        });
        const mainContent = document.querySelector('main');
        rewriteContentLinks(mainContent);
        if (mainContent) new MutationObserver(() => rewriteContentLinks(mainContent)).observe(mainContent, { childList: true, subtree: true });
        document.body.classList.toggle('f2-mode', isF2Mode);
        document.body.classList.toggle('f3-mode', isF3Mode);
        document.body.classList.toggle('academy-mode', isAcademyMode);
        if (activeSeries === 'f1' && !document.title.includes('Formula 1')) {
            document.title = document.title === 'Racelytic'
                ? 'Formula 1 · Racelytic'
                : `${document.title.replace(/\s*·\s*Racelytic$/, '')} · Formula 1 · Racelytic`;
        }
        const brand = container.querySelector('.brand');
        if (brand) brand.href = isAcademyMode ? '/academy' : activeSeries === 'f3' ? '/f3' : activeSeries === 'f2' ? '/f2' : '/';

        let favicon = document.querySelector('link[rel~="icon"]');
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = 'icon';
            favicon.type = 'image/svg+xml';
            document.head.appendChild(favicon);
        }
        favicon.href = `/assets/favicon-${activeSeries}.svg`;

        const pagePairs = {
            '/': '/f2', '/database': '/f2/database', '/seasons': '/f2/seasons', '/races': '/f2/races',
            '/drivers': '/f2/drivers', '/circuits': '/f2/circuits', '/constructors': '/f2/constructors',
            '/chassis': '/f2/chassis',
            '/analysis': '/f2/analysis', '/season-analysis': '/f2/season-analysis',
            '/season-comparison': '/f2/season-comparison', '/race-analysis': '/f2/race-analysis',
            '/driver-comparison': '/f2/driver-comparison', '/driver-form': '/f2/driver-form',
            '/teammate-battles': '/f2/teammate-battles', '/circuit-analysis': '/f2/circuit-analysis',
            '/records': '/f2/records', '/simulator-overview': '/f2/simulator', '/simulator': '/f2/simulate-season',
            '/scenario-calculator': '/f2/scenario-calculator', '/championship-builder': '/f2/championship-builder',
            '/points-systems': '/f2/points-systems', '/games': '/f2/games', '/quizzes': '/f2/quizzes',
            '/world-champions-quiz': '/f2/champions-quiz', '/race-winners-quiz': '/f2/race-winners-quiz',
            '/about': '/f2/about'
        };
        const reversePagePairs = Object.fromEntries(Object.entries(pagePairs).map(([f1, f2]) => [f2, f1]));
        const f3PagePairs = {
            '/': '/f3', '/database': '/f3/database', '/seasons': '/f3/seasons', '/races': '/f3/races',
            '/drivers': '/f3/drivers', '/constructors': '/f3/teams', '/circuits': '/f3/circuits',
            '/chassis': '/f3/chassis',
            '/analysis': '/f3/analysis', '/season-analysis': '/f3/season-analysis',
            '/season-comparison': '/f3/season-comparison', '/race-analysis': '/f3/race-analysis',
            '/driver-comparison': '/f3/driver-comparison', '/driver-form': '/f3/driver-form',
            '/teammate-battles': '/f3/teammate-battles', '/circuit-analysis': '/f3/circuit-analysis',
            '/records': '/f3/records',
            '/simulator-overview': '/f3/simulator', '/simulator': '/f3/simulate-season',
            '/scenario-calculator': '/f3/scenario-calculator', '/championship-builder': '/f3/championship-builder',
            '/points-systems': '/f3/points-systems',
            '/games': '/f3/games', '/about': '/f3/about'
        };
        const reverseF3PagePairs = Object.fromEntries(Object.entries(f3PagePairs).map(([f1, f3]) => [f3, f1]));
        const academyPagePairs = Object.fromEntries(Object.entries(f3PagePairs).map(([f1, f3]) => [f1, f3.replace('/f3', '/academy')]));
        const reverseAcademyPagePairs = Object.fromEntries(Object.entries(academyPagePairs).map(([f1, academy]) => [academy, f1]));
        const detailPages = {
            '/season': ['season', '/f2/seasons'], '/race': ['race', '/f2/races'],
            '/driver': ['driver', '/f2/drivers'], '/circuit': ['circuit', '/f2/circuits'],
            '/constructor': ['constructor', '/f2/constructors'],
            '/f2/season': ['season', '/seasons'], '/f2/race': ['race', '/races'],
            '/f2/driver': ['driver', '/drivers'], '/f2/circuit': ['circuit', '/circuits'],
            '/f2/constructor': ['constructor', '/constructors'],
            '/f3/season': ['season', '/seasons'], '/f3/race': ['race', '/races'],
            '/f3/driver': ['driver', '/drivers'], '/f3/team': ['constructor', '/constructors'],
            '/f3/circuit': ['circuit', '/circuits'],
            '/academy/season': ['season', '/seasons'], '/academy/race': ['race', '/races'],
            '/academy/driver': ['driver', '/drivers'], '/academy/team': ['constructor', '/constructors'],
            '/academy/circuit': ['circuit', '/circuits']
        };
        const seriesDetailParents = {
            f1: { season: '/seasons', race: '/races', driver: '/drivers', constructor: '/constructors', circuit: '/circuits' },
            f2: { season: '/f2/seasons', race: '/f2/races', driver: '/f2/drivers', constructor: '/f2/constructors', circuit: '/f2/circuits' },
            f3: { season: '/f3/seasons', race: '/f3/races', driver: '/f3/drivers', constructor: '/f3/teams', circuit: '/f3/circuits' },
            academy: { season: '/academy/seasons', race: '/academy/races', driver: '/academy/drivers', constructor: '/academy/teams', circuit: '/academy/circuits' }
        };
        const resolveSeriesTarget = async targetSeries => {
            if (isSeriesNeutralPage) return `${window.location.pathname}?series=${targetSeries}`;
            const canonicalPage = isAcademyMode
                ? reverseAcademyPagePairs[window.location.pathname]
                : isF3Mode
                ? reverseF3PagePairs[window.location.pathname]
                : isF2Mode ? reversePagePairs[window.location.pathname] : window.location.pathname;
            const topLevelTarget = targetSeries === 'academy'
                ? academyPagePairs[canonicalPage]
                : targetSeries === 'f3'
                ? f3PagePairs[canonicalPage]
                : targetSeries === 'f2' ? pagePairs[canonicalPage] : canonicalPage;
            if (topLevelTarget) return `${topLevelTarget}${window.location.search}${window.location.hash}`;
            if (['f3', 'academy'].includes(targetSeries)) {
                const targetBase = targetSeries === 'academy' ? '/academy' : '/f3';
                const detail = detailPages[window.location.pathname];
                if (detail) {
                    const parameter = detail[0] === 'season' ? 'year' : 'id';
                    const id = new URLSearchParams(window.location.search).get(parameter);
                    if (id) {
                        try {
                            const equivalent = await fetch(`/api/series-equivalent?target=${targetSeries}&type=${detail[0]}&id=${encodeURIComponent(id)}&source=${activeSeries}`);
                            if (equivalent.ok) return (await equivalent.json()).url;
                        } catch {}
                    }
                    return seriesDetailParents[targetSeries][detail[0]];
                }
                const currentPath = canonicalPage || window.location.pathname;
                if (/analysis|comparison|driver-form|teammate|records/.test(currentPath)) return `${targetBase}/analysis`;
                if (/simulator|simulate-race|scenario|championship-builder|points-systems/.test(currentPath)) return `${targetBase}/simulator`;
                if (/games|quiz/.test(currentPath)) return `${targetBase}/games`;
                if (/database|season|race|driver|constructor|circuit|chassis/.test(currentPath)) return `${targetBase}/database`;
                return targetBase;
            }
            const targetF2 = targetSeries === 'f2';
            const pair = targetF2 ? pagePairs[window.location.pathname] : reversePagePairs[window.location.pathname];
            if (pair) return `${pair}${window.location.search}${window.location.hash}`;
            const detail = detailPages[window.location.pathname];
            if (detail) {
                const parameter = detail[0] === 'season' ? 'year' : 'id';
                const id = new URLSearchParams(window.location.search).get(parameter);
                const detailParent = seriesDetailParents[targetSeries]?.[detail[0]] || detail[1];
                if (!id) return detailParent;
                try {
                    const equivalent = await fetch(`/api/series-equivalent?target=${targetSeries}&type=${detail[0]}&id=${encodeURIComponent(id)}&source=${activeSeries}`);
                    if (equivalent.ok) return (await equivalent.json()).url;
                } catch {}
                return detailParent;
            }
            if (canonicalPage === '/chassis' && targetF2) return '/f2/database';
            if (canonicalPage === '/simulate-race' && targetF2) return '/f2/simulator';
            return targetF2 ? '/f2' : '/';
        };

        container.querySelectorAll('.series-switcher a').forEach(link => {
            const active = link.dataset.series === activeSeries;
            if (active) {
                link.href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            } else {
                const detail = detailPages[window.location.pathname];
                const fallback = (detail && seriesDetailParents[link.dataset.series]?.[detail[0]])
                    || (isSeriesNeutralPage ? `${window.location.pathname}?series=${link.dataset.series}` : link.href);
                link.href = fallback;
                resolveSeriesTarget(link.dataset.series).then(url => { link.href = url; });
            }
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
        });
        if (isF3Mode || isAcademyMode) {
            const seriesBase = isAcademyMode ? '/academy' : '/f3';
            const seriesName = isAcademyMode ? 'F1 Academy' : 'Formula 3';
            const seriesShortName = isAcademyMode ? 'F1 Academy' : 'F3';
            document.title = document.title
                .replace('Formula 1', seriesName)
                .replace('Formula 2', seriesName)
                .replace('Formula 3', seriesName);
            if (!document.title.includes(seriesName)) {
                document.title = document.title === 'Racelytic'
                    ? `${seriesName} · Racelytic`
                    : `${document.title.replace(/\s*·\s*Racelytic$/, '')} · ${seriesName} · Racelytic`;
            }
            const navigationDropdowns = [...container.querySelectorAll('.nav-dropdown')];
            const f3Menus = [
                ['FORMULA 3 DATABASE', [
                    ['/f3/database', 'Overview', 'Browse the Formula 3 dataset'],
                    ['/f3/seasons', 'Seasons', 'Formula 3 championship history'],
                    ['/f3/races', 'Races', 'Every Formula 3 race weekend'],
                    ['/f3/drivers', 'Drivers', 'Formula 3 careers and results'],
                    ['/f3/teams', 'Teams', 'Formula 3 team history and results'],
                    ['/f3/circuits', 'Circuits', 'Formula 3 tracks and venues'],
                    ['/f3/chassis', 'Chassis', 'Formula 3 chassis and engine records']
                ]],
                ['FORMULA 3 ANALYSIS', [
                    ['/f3/analysis', 'Overview', 'Choose a Formula 3 analysis'],
                    ['/f3/season-analysis', 'Season analysis', 'Championship progression and results'],
                    ['/f3/season-comparison', 'Season comparison', 'Compare two championships'],
                    ['/f3/race-analysis', 'Race analysis', 'Explore a Formula 3 race'],
                    ['/f3/driver-comparison', 'Driver comparison', 'Career and teammate battles'],
                    ['/f3/driver-form', 'Driver form', 'Rolling recent-race performance'],
                    ['/f3/teammate-battles', 'Teammate battles', 'Direct intra-team head-to-heads'],
                    ['/f3/circuit-analysis', 'Circuit analysis', 'Performance by venue'],
                    ['/f3/records', 'Records', 'Formula 3 all-time leaders']
                ]],
                ['FORMULA 3 SIMULATOR', [
                    ['/f3/simulator', 'Overview', 'Choose a Formula 3 simulation tool'],
                    ['/f3/simulate-season', 'Simulate season', 'Recalculate an F3 championship'],
                    ['/f3/scenario-calculator', 'Scenario calculator', 'Project a championship run-in'],
                    ['/f3/championship-builder', 'Championship builder', 'Create a custom F3 calendar'],
                    ['/f3/points-systems', 'Points systems', 'Create and manage scoring rules']
                ]],
                ['FORMULA 3 GAMES', [
                    ['/f3/games', 'Overview', 'Choose a Formula 3 game']
                ]]
            ];
            const seriesMenus = isAcademyMode
                ? f3Menus.map(([title, items]) => [
                    title.replace('FORMULA 3', 'F1 ACADEMY'),
                    items.map(([url, label, description]) => [
                        url.replace('/f3', '/academy'), label,
                        description.replace(/Formula 3|F3/g, 'F1 Academy')
                    ])
                ])
                : f3Menus;
            navigationDropdowns.forEach((dropdown, index) => {
                const links = [...dropdown.querySelectorAll('.dropdown-menu a')];
                const menu = seriesMenus[index];
                if (!menu || !links[0]) return dropdown.remove();
                links.forEach((link, linkIndex) => {
                    const item = menu[1][linkIndex];
                    if (!item) return link.remove();
                    link.href = item[0];
                    link.querySelector('span').textContent = item[1];
                    link.querySelector('small').textContent = item[2];
                });
                const title = dropdown.querySelector('.dropdown-title');
                if (title) title.textContent = menu[0];
            });
            const aboutLink = container.querySelector('a[href="/about"]');
            if (aboutLink) aboutLink.href = `${seriesBase}/about`;
            container.querySelectorAll('a[href="/account"]').forEach(link => { link.href = `/account?series=${activeSeries}`; });
            const pointsSimulatorLink = document.querySelector('.points-library-hero a[href="/simulator"]');
            if (pointsSimulatorLink) pointsSimulatorLink.href = `${seriesBase}/simulate-season`;
            const pointsAccountLink = document.querySelector('.points-login-prompt a[href="/account"]');
            if (pointsAccountLink) pointsAccountLink.href = `/account?series=${activeSeries}`;
            if (window.location.pathname === `${seriesBase}/points-systems`) {
                const hero = document.querySelector('.points-library-hero');
                if (hero) {
                    hero.querySelector('.eyebrow').textContent = `${seriesName.toUpperCase()} CHAMPIONSHIP RULES`;
                    hero.querySelector('h1').textContent = `${seriesName} points systems.`;
                    hero.querySelector('p').textContent = `Create reusable feature, reverse-grid, qualifying and bonus-point rules for ${seriesName} simulations.`;
                }
            }
        }
        if (isF2Mode) {
            document.title = document.title
                .replace('Formula 1', 'Formula 2')
                .replace(/(^|\s)F1(?=\s|$)/, '$1F2');
            if (!document.title.includes('Formula 2')) {
                document.title = document.title === 'Racelytic'
                    ? 'Formula 2 · Racelytic'
                    : `${document.title.replace(/\s*·\s*Racelytic$/, '')} · Formula 2 · Racelytic`;
            }
            const analysisBackLink = document.querySelector('.back-link[href="/analysis"]');
            if (analysisBackLink) analysisBackLink.href = '/f2/analysis';
            const navigationDropdowns = [...container.querySelectorAll('.nav-dropdown')];
            const databaseLinks = [...(navigationDropdowns[0]?.querySelectorAll('.dropdown-menu a') || [])];
            if (databaseLinks[0]) databaseLinks[0].href = '/f2/database';
            if (databaseLinks[1]) databaseLinks[1].href = '/f2/seasons';
            if (databaseLinks[2]) databaseLinks[2].href = '/f2/races';
            if (databaseLinks[3]) databaseLinks[3].href = '/f2/drivers';
            if (databaseLinks[4]) databaseLinks[4].href = '/f2/circuits';
            if (databaseLinks[5]) databaseLinks[5].href = '/f2/constructors';
            if (databaseLinks[6]) {
                databaseLinks[6].href = '/f2/chassis';
                databaseLinks[6].querySelector('span').textContent = 'Chassis';
                databaseLinks[6].querySelector('small').textContent = 'Formula 2 chassis and engine records';
            }
            databaseLinks.forEach((link, index) => {
                if (![0, 1, 2, 3, 4, 5, 6].includes(index)) link.remove();
            });
            const analysisDropdown = navigationDropdowns[1];
            const analysisLinks = [...(analysisDropdown?.querySelectorAll('.dropdown-menu a') || [])];
            const analysisTitle = analysisDropdown?.querySelector('.dropdown-title');
            if (analysisTitle) analysisTitle.textContent = 'FORMULA 2 ANALYSIS';
            if (analysisLinks[0]) {
                analysisLinks[0].href = '/f2/analysis';
                analysisLinks[0].querySelector('span').textContent = 'Overview';
                analysisLinks[0].querySelector('small').textContent = 'Choose a Formula 2 analysis';
            }
            if (analysisLinks[1]) {
                analysisLinks[1].href = '/f2/season-analysis';
                analysisLinks[1].querySelector('span').textContent = 'Season analysis';
                analysisLinks[1].querySelector('small').textContent = 'Championship progression and results';
            }
            const f2AnalysisRoutes = [
                ['/f2/season-comparison', 'Season comparison', 'Compare two championships'],
                ['/f2/race-analysis', 'Race analysis', 'Explore a Formula 2 weekend'],
                ['/f2/driver-comparison', 'Driver comparison', 'Career and teammate battles'],
                ['/f2/driver-form', 'Driver form', 'Rolling recent-race performance'],
                ['/f2/teammate-battles', 'Teammate battles', 'Direct intra-team head-to-heads'],
                ['/f2/circuit-analysis', 'Circuit analysis', 'Performance by venue and era'],
                ['/f2/records', 'Records', 'Formula 2 all-time leaders']
            ];
            analysisLinks.slice(2).forEach((link, index) => {
                const item = f2AnalysisRoutes[index];
                if (!item) return link.remove();
                link.href = item[0];
                link.querySelector('span').textContent = item[1];
                link.querySelector('small').textContent = item[2];
            });

            const simulatorDropdown = navigationDropdowns[2];
            const simulatorLinks = [...(simulatorDropdown?.querySelectorAll('.dropdown-menu a') || [])];
            const f2SimulatorRoutes = [
                ['/f2/simulator', 'Overview', 'Choose a Formula 2 simulation tool'],
                ['/f2/simulate-season', 'Simulate season', 'Recalculate an F2 championship'],
                ['/f2/scenario-calculator', 'Scenario calculator', 'Project a championship run-in'],
                ['/f2/championship-builder', 'Championship builder', 'Create a custom F2 calendar'],
                ['/f2/points-systems', 'Points systems', 'Create and manage scoring rules']
            ];
            simulatorLinks.forEach((link, index) => {
                const item = f2SimulatorRoutes[index];
                if (!item) return link.remove();
                link.href = item[0];
                link.querySelector('span').textContent = item[1];
                link.querySelector('small').textContent = item[2];
            });
            const simulatorTitle = simulatorDropdown?.querySelector('.dropdown-title');
            if (simulatorTitle) simulatorTitle.textContent = 'FORMULA 2 SIMULATOR';
            const gamesDropdown = navigationDropdowns[3];
            const gamesLinks = [...(gamesDropdown?.querySelectorAll('.dropdown-menu a') || [])];
            const f2GamesRoutes = [
                ['/f2/games', 'Overview', 'Choose a Formula 2 game'],
                ['/f2/quizzes', 'Quizzes', 'Test your Formula 2 knowledge']
            ];
            gamesLinks.forEach((link, index) => {
                const item = f2GamesRoutes[index];
                if (!item) return link.remove();
                link.href = item[0];
                link.querySelector('span').textContent = item[1];
                link.querySelector('small').textContent = item[2];
            });
            const gamesTitle = gamesDropdown?.querySelector('.dropdown-title');
            if (gamesTitle) gamesTitle.textContent = 'FORMULA 2 GAMES';
            const aboutLink = container.querySelector('a[href="/about"]');
            if (aboutLink) aboutLink.href = '/f2/about';
            container.querySelectorAll('a[href="/account"]').forEach(link => { link.href = '/account?series=f2'; });
            const simulatorBackLink = document.querySelector('.back-link[href="/simulator"], .back-link[href="/simulator-overview"]');
            if (simulatorBackLink) simulatorBackLink.href = '/f2/simulator';
            const pointsSimulatorLink = document.querySelector('.points-library-hero a[href="/simulator"]');
            if (pointsSimulatorLink) pointsSimulatorLink.href = '/f2/simulate-season';
            const pointsAccountLink = document.querySelector('.points-login-prompt a[href="/account"]');
            if (pointsAccountLink) pointsAccountLink.href = '/account?series=f2';
            const accountBuilderLink = document.querySelector('#custom-championship-manager a[href="/championship-builder"]');
            if (accountBuilderLink) accountBuilderLink.href = '/f2/championship-builder';
            const rewriteF2Links = root => {
                const links = root.matches?.('a[href]') ? [root] : [...(root.querySelectorAll?.('a[href]') || [])];
                links.forEach(link => {
                    if (link.closest('.series-switcher, #global-search-results')) return;
                    const href = link.getAttribute('href') || '';
                    if (/^\/(season|race|driver|circuit|constructor)(?=[/?#])/.test(href)) {
                        link.setAttribute('href', `/f2${href}`);
                    }
                });
            };
            rewriteF2Links(document.body);
            new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) rewriteF2Links(node);
            }))).observe(document.body, { childList: true, subtree: true });
            const f2Copy = {
                '/f2/simulate-season': ['FORMULA 2 SIMULATOR', 'Rewrite a Formula 2 championship.', 'Apply a different feature, sprint and bonus-points system to any Formula 2 season.'],
                '/f2/scenario-calculator': ['FORMULA 2 SCENARIOS', 'Shape the Formula 2 title run-in.', 'Freeze the standings after any round, rewrite the remaining feature results and retain each sprint classification.'],
                '/f2/championship-builder': ['FORMULA 2 CHAMPIONSHIP BUILDER', 'Your races. Your rules.', 'Combine individual Formula 2 sprint and feature races, choose the field and calculate a custom championship.'],
                '/f2/points-systems': ['FORMULA 2 CHAMPIONSHIP RULES', 'Formula 2 points systems.', 'Create reusable feature, sprint, qualifying and bonus-point rules.']
            }[window.location.pathname];
            if (f2Copy) {
                document.title = `${f2Copy[0].replace('FORMULA 2 ', '').replaceAll(' ', ' ').toLowerCase().replace(/(^|\s)\S/g, character => character.toUpperCase())} · Formula 2 · Racelytic`;
                const hero = document.querySelector('.simulator-hero, .points-library-hero');
                if (hero) {
                    const eyebrow = hero.querySelector('.eyebrow');
                    const heading = hero.querySelector('h1');
                    const paragraph = hero.querySelector('p');
                    if (eyebrow) eyebrow.textContent = f2Copy[0];
                    if (heading) heading.textContent = f2Copy[1];
                    if (paragraph) paragraph.textContent = f2Copy[2];
                }
                const grandPrixLabel = document.querySelector('.builder-race-picker label:nth-child(2) > span');
                if (grandPrixLabel) grandPrixLabel.textContent = 'Race weekend';
            }
            document.addEventListener('click', event => {
                const link = event.target.closest('a[href]');
                if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                if (link.closest('.series-switcher, #global-search-results')) return;
                const target = new URL(link.href, window.location.origin);
                if (target.origin !== window.location.origin) return;
                if (/^\/(driver|constructor|race|season|circuit)(?:$|\/)/.test(target.pathname)) {
                    event.preventDefault();
                    window.location.href = `/f2${target.pathname}${target.search}${target.hash}`;
                }
            });
        }

        const dropdowns = [...container.querySelectorAll('.nav-dropdown')];
        const mainNav = container.querySelector('.main-nav');
        const mobileToggle = container.querySelector('.mobile-nav-toggle');
        const searchInput = container.querySelector('#global-search-input');
        const searchResults = container.querySelector('#global-search-results');
        let searchTimer;

        const safeText = value => String(value ?? '')
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

        const closeSearch = () => {
            if (!searchResults) return;
            searchResults.hidden = true;
            searchInput?.setAttribute('aria-expanded', 'false');
        };

        const renderSearchResults = results => {
            if (!searchResults) return;
            searchResults.innerHTML = results.length ? results.map(result => `
                <a href="${safeText(result.url)}" class="global-search-result">
                    <span>${safeText(result.type)}</span>
                    <strong>${safeText(result.label)}</strong>
                    <small>${safeText(result.meta)}</small>
                </a>
            `).join('') : '<div class="global-search-empty">No matching pages or database entries.</div>';
            searchResults.hidden = false;
            searchInput.setAttribute('aria-expanded', 'true');
        };

        searchInput?.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            const query = searchInput.value.trim();
            if (query.length < 2) {
                closeSearch();
                return;
            }
            searchTimer = window.setTimeout(async () => {
                searchResults.hidden = false;
                searchResults.innerHTML = '<div class="global-search-empty">Searching…</div>';
                searchInput.setAttribute('aria-expanded', 'true');
                try {
                    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                    if (!response.ok) throw new Error('Search failed');
                    if (searchInput.value.trim() === query) renderSearchResults(await response.json());
                } catch (error) {
                    console.error('Search error:', error);
                    searchResults.innerHTML = '<div class="global-search-empty">Search is temporarily unavailable.</div>';
                }
            }, 180);
        });

        searchInput?.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                closeSearch();
                searchInput.blur();
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                searchResults?.querySelector('a')?.focus();
            }
            if (event.key === 'Enter') {
                const firstResult = searchResults?.querySelector('a');
                if (firstResult && !searchResults.hidden) {
                    event.preventDefault();
                    firstResult.click();
                }
            }
        });

        const closeMobileNavigation = () => {
            mainNav?.classList.remove('is-open');
            mobileToggle?.setAttribute('aria-expanded', 'false');
            mobileToggle?.setAttribute('aria-label', 'Open navigation');
            document.body.classList.remove('mobile-nav-open');
            dropdowns.forEach(dropdown => {
                dropdown.classList.remove('is-open');
                dropdown.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
            });
        };

        mobileToggle?.addEventListener('click', event => {
            event.stopPropagation();
            const open = mainNav.classList.toggle('is-open');
            mobileToggle.setAttribute('aria-expanded', String(open));
            mobileToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
            document.body.classList.toggle('mobile-nav-open', open);
            if (!open) closeMobileNavigation();
        });

        dropdowns.forEach(dropdown => {
            const toggle = dropdown.querySelector('.dropdown-toggle');
            if (!toggle) return;
            toggle.addEventListener('click', () => {
                dropdowns.filter(item => item !== dropdown).forEach(item => {
                    item.classList.remove('is-open');
                    item.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
                });
                const open = dropdown.classList.toggle('is-open');
                toggle.setAttribute('aria-expanded', String(open));
            });

            toggle.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    dropdown.classList.remove('is-open');
                    toggle.setAttribute('aria-expanded', 'false');
                    toggle.focus();
                }
            });

        });
        document.addEventListener('click', event => dropdowns.forEach(dropdown => {
            if (dropdown.contains(event.target)) return;
            dropdown.classList.remove('is-open');
            dropdown.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
        }));

        document.addEventListener('click', event => {
            if (container.contains(event.target)) return;
            closeMobileNavigation();
            closeSearch();
        });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            closeMobileNavigation();
            closeSearch();
            mobileToggle?.focus();
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 800) closeMobileNavigation();
        });

        container.querySelectorAll('a[href]').forEach(link => {
            const linkPath = new URL(link.href, window.location.origin).pathname;
            const isSeriesSwitchLink = link.closest('.series-switcher');
            if (!isSeriesSwitchLink && linkPath === window.location.pathname) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
                link.closest('.nav-dropdown')?.querySelector('.dropdown-toggle')?.classList.add('active');
            }
            link.addEventListener('click', closeMobileNavigation);
        });

        const accountLink = container.querySelector('#account-link');
        if (accountLink) accountLink.href = `/account?series=${activeSeries}`;
        const updateAccountLink = user => {
            if (accountLink) accountLink.textContent = user?.displayName || 'Sign in';
        };
        fetch('/api/account')
            .then(response => response.ok ? response.json() : { user: null })
            .then(data => updateAccountLink(data.user))
            .catch(() => updateAccountLink(null));
        window.addEventListener('account-changed', event => updateAccountLink(event.detail));

    } catch (error) {
        console.error('Header error:', error);
    }
}

loadHeader();

async function loadFooter() {
    const footer = document.querySelector('.footer');
    if (!footer) return;
    try {
        const response = await fetch('/components/footer.html');
        if (!response.ok) throw new Error('Failed to load footer');
        footer.innerHTML = (await response.text()).replace('{{year}}', String(new Date().getFullYear()));
        const isF2Mode = window.location.pathname === '/f2' || window.location.pathname.startsWith('/f2/');
        const isF3Mode = window.location.pathname === '/f3' || window.location.pathname.startsWith('/f3/');
        const isAcademyMode = window.location.pathname === '/academy' || window.location.pathname.startsWith('/academy/');
        const summary = footer.querySelector('[data-footer-summary]');
        const trademark = footer.querySelector('[data-footer-trademark]');
        const source = footer.querySelector('[data-footer-source]');
        if (isF2Mode) {
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/f2';
            if (summary) summary.textContent = 'Independent Formula 2 history, statistics, and championship analysis.';
            if (trademark) trademark.textContent = 'Racelytic is unofficial and is not associated with or endorsed by the FIA Formula 2 Championship, the FIA, the Formula 1 companies, or any team. FIA FORMULA 2 CHAMPIONSHIP, FIA FORMULA 2, FORMULA 2, F2 and related marks are trade marks of the Fédération Internationale de l’Automobile and are used by their authorised operators under licence.';
            if (source) source.innerHTML = 'Formula 2 statistics are compiled from <a href="https://www.motorsportstats.com/" target="_blank" rel="noopener noreferrer">Motorsport Stats</a> classifications and project-maintained corrections. Third-party materials remain subject to their owners’ rights. Data may contain errors and is not an official record.';
        }
        if (isF3Mode) {
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/f3';
            if (summary) summary.textContent = 'Independent Formula 3 history, statistics, and championship analysis.';
            if (trademark) trademark.textContent = 'Racelytic is unofficial and is not associated with or endorsed by the FIA Formula 3 Championship, the FIA, the Formula 1 companies, or any team. FIA FORMULA 3 CHAMPIONSHIP, FIA FORMULA 3, FORMULA 3, F3 and related marks are trade marks of the Fédération Internationale de l’Automobile and are used by their authorised operators under licence.';
            if (source) source.innerHTML = 'Formula 3 statistics are compiled from <a href="https://www.motorsportstats.com/" target="_blank" rel="noopener noreferrer">Motorsport Stats</a> classifications, official championship sources, and project-maintained corrections. Third-party materials remain subject to their owners’ rights. Data may contain errors and is not an official record.';
        }
        if (isAcademyMode) {
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/academy';
            if (summary) summary.textContent = 'Independent F1 Academy history, statistics, and championship analysis.';
            if (trademark) trademark.textContent = 'Racelytic is unofficial and is not associated with or endorsed by F1 Academy, Formula One Management, the FIA, any team, or any driver. F1 ACADEMY, F1, FORMULA 1 and related marks belong to their respective owners.';
            if (source) source.innerHTML = 'F1 Academy calendars, classifications and standings are compiled from the <a href="https://www.f1academy.com/" target="_blank" rel="noopener noreferrer">official F1 Academy website</a> and project-maintained normalisation. Third-party materials remain subject to their owners’ rights. Data may contain errors and is not an official record.';
        }
        footer.querySelector('[data-privacy-settings]')?.addEventListener('click', () => showAnalyticsChoice(true));
    } catch (error) {
        console.error('Footer error:', error);
    }
}

loadFooter();

const ANALYTICS_CONSENT_KEY = 'racelytic-analytics-consent';
const ANALYTICS_VISITOR_KEY = 'racelytic-visitor-id';
const ANALYTICS_CONSENT_LIFETIME = 13 * 30.44 * 24 * 60 * 60 * 1000;
let stopAnalytics = null;

function analyticsChoice() {
    try {
        const stored = JSON.parse(localStorage.getItem(ANALYTICS_CONSENT_KEY) || 'null');
        if (!stored?.choice || Date.now() - Number(stored.decidedAt) >= ANALYTICS_CONSENT_LIFETIME) {
            localStorage.removeItem(ANALYTICS_CONSENT_KEY);
            localStorage.removeItem(ANALYTICS_VISITOR_KEY);
            return null;
        }
        return stored.choice;
    } catch {
        try {
            localStorage.removeItem(ANALYTICS_CONSENT_KEY);
            localStorage.removeItem(ANALYTICS_VISITOR_KEY);
        } catch {}
        return null;
    }
}

function setAnalyticsChoice(choice) {
    try {
        localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ choice, decidedAt: Date.now() }));
        if (choice !== 'allowed') localStorage.removeItem(ANALYTICS_VISITOR_KEY);
    } catch {}
    if (choice === 'allowed') {
        if (!stopAnalytics) stopAnalytics = startAnonymousAnalytics();
    } else if (stopAnalytics) {
        stopAnalytics();
        stopAnalytics = null;
    }
    document.querySelector('.privacy-banner')?.remove();
}

function showAnalyticsChoice(settings = false) {
    document.querySelector('.privacy-banner')?.remove();
    const banner = document.createElement('aside');
    banner.className = 'privacy-banner';
    banner.setAttribute('aria-label', 'Analytics privacy choice');
    banner.innerHTML = `
        <div class="privacy-banner-copy">
            <strong>${settings ? 'Analytics privacy settings' : 'Your privacy choice'}</strong>
            <p>Racelytic uses optional first-party analytics to count visits, pages viewed and active time. If allowed, Racelytic stores a random visitor ID in your browser for up to 13 months. No advertising trackers are used. <a href="/privacy#choices">Privacy Notice</a></p>
        </div>
        <div class="privacy-banner-actions">
            <button type="button" class="button secondary" data-analytics-choice="declined">Decline</button>
            <button type="button" class="button primary" data-analytics-choice="allowed">Allow analytics</button>
        </div>`;
    banner.querySelectorAll('[data-analytics-choice]').forEach(button => button.addEventListener('click', () => setAnalyticsChoice(button.dataset.analyticsChoice)));
    document.body.appendChild(banner);
}

function startAnonymousAnalytics() {
    if (navigator.doNotTrack === '1' || window.location.pathname.startsWith('/monitor')) return null;
    const uuid = () => crypto.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
        const random = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
        return (character === 'x' ? random : (random & 3) | 8).toString(16);
    });
    let visitorId;
    try {
        visitorId = localStorage.getItem(ANALYTICS_VISITOR_KEY) || uuid();
        localStorage.setItem(ANALYTICS_VISITOR_KEY, visitorId);
    } catch {
        visitorId = uuid();
    }
    const id = uuid();
    let running = true;
    let activeMilliseconds = 0;
    let activeSince = document.visibilityState === 'visible' ? performance.now() : null;
    const duration = () => Math.round((activeMilliseconds + (activeSince === null ? 0 : performance.now() - activeSince)) / 1000);
    const send = (url, data) => {
        const body = JSON.stringify(data);
        if (navigator.sendBeacon) return navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    };
    let referrerHost = '';
    try {
        const referrer = document.referrer && new URL(document.referrer);
        if (referrer && referrer.host !== window.location.host) referrerHost = referrer.host;
    } catch {}
    send('/api/analytics/visit', { id, visitorId, path: location.pathname, referrerHost });
    const heartbeat = () => {
        if (running) send('/api/analytics/heartbeat', { id, duration: duration() });
    };
    const timer = window.setInterval(heartbeat, 15000);
    const handleVisibility = () => {
        if (document.visibilityState === 'hidden' && activeSince !== null) {
            activeMilliseconds += performance.now() - activeSince;
            activeSince = null;
            heartbeat();
        } else if (document.visibilityState === 'visible' && activeSince === null) {
            activeSince = performance.now();
        }
    };
    const handlePageHide = () => {
        window.clearInterval(timer);
        if (activeSince !== null) activeMilliseconds += performance.now() - activeSince;
        activeSince = null;
        heartbeat();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
        running = false;
        window.clearInterval(timer);
        activeSince = null;
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('pagehide', handlePageHide);
    };
}

const storedAnalyticsChoice = analyticsChoice();
if (storedAnalyticsChoice === 'allowed') stopAnalytics = startAnonymousAnalytics();
else if (!storedAnalyticsChoice && !window.location.pathname.startsWith('/monitor')) showAnalyticsChoice();
