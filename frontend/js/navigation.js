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
        const seriesNeutralPages = ['/account', '/privacy', '/terms', '/about', '/community'];
        const isSeriesNeutralPage = seriesNeutralPages.includes(window.location.pathname);
        const seriesKeys = Object.keys(window.RacelyticSeries.all);
        const pathSeries = window.RacelyticSeries.fromPath().key;
        const neutralSeries = seriesKeys.includes(requestedSeries)
            ? requestedSeries
            : seriesKeys.includes(rememberedSeries) ? rememberedSeries : 'f1';
        const activeSeries = isSeriesNeutralPage ? neutralSeries : pathSeries;
        const seriesConfig = window.RacelyticSeries.all[activeSeries];
        const isF2Mode = activeSeries === 'f2';
        const isF3Mode = activeSeries === 'f3';
        const isAcademyMode = activeSeries === 'academy';
        try { localStorage.setItem('racelytic-series', activeSeries); } catch {}
        if (window.location.pathname === '/about') document.title = 'About Racelytic · Racelytic';

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
        if (!isSeriesNeutralPage && activeSeries === 'f1' && !document.title.includes('Formula 1')) {
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
        favicon.href = seriesConfig.favicon;

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
            '/idle-racing-manager': '/f2/idle-racing-manager',
            '/lights-out': '/f2/lights-out',
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
            '/games': '/f3/games', '/idle-racing-manager': '/f3/idle-racing-manager', '/lights-out': '/f3/lights-out', '/about': '/f3/about'
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
            if (!isSeriesNeutralPage) {
                document.title = document.title
                    .replace('Formula 1', seriesName)
                    .replace('Formula 2', seriesName)
                    .replace('Formula 3', seriesName);
                if (!document.title.includes(seriesName)) {
                    document.title = document.title === 'Racelytic'
                        ? `${seriesName} · Racelytic`
                        : `${document.title.replace(/\s*·\s*Racelytic$/, '')} · ${seriesName} · Racelytic`;
                }
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
                    ['/f3/games', 'Overview', 'Choose a Formula 3 game'],
                    ['/idle-racing-manager', 'Idle Racing Manager', 'Build a fictional racing team'],
                    ['/f3/lights-out', 'Lights Out!', 'Test your reaction time']
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
            if (aboutLink) aboutLink.href = `/about?series=${activeSeries}`;
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
            if (!isSeriesNeutralPage) {
                document.title = document.title
                    .replace('Formula 1', 'Formula 2')
                    .replace(/(^|\s)F1(?=\s|$)/, '$1F2');
                if (!document.title.includes('Formula 2')) {
                    document.title = document.title === 'Racelytic'
                        ? 'Formula 2 · Racelytic'
                        : `${document.title.replace(/\s*·\s*Racelytic$/, '')} · Formula 2 · Racelytic`;
                }
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
                ['/f2/quizzes', 'Quizzes', 'Test your Formula 2 knowledge'],
                ['/idle-racing-manager', 'Idle Racing Manager', 'Build a fictional racing team'],
                ['/f2/lights-out', 'Lights Out!', 'Test your reaction time']
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
            if (aboutLink) aboutLink.href = '/about?series=f2';
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
        const { closeSearch, restoreTypedSearchQuery } = window.RacelyticSearch.init(container, activeSeries);

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
            restoreTypedSearchQuery();
            closeMobileNavigation();
            closeSearch();
        });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            const mobileNavigationWasOpen = mainNav?.classList.contains('is-open');
            restoreTypedSearchQuery();
            closeMobileNavigation();
            closeSearch();
            if (mobileNavigationWasOpen) mobileToggle?.focus();
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
