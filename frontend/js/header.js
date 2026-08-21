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
        const isAccountPage = window.location.pathname === '/account';
        const isF2Mode = window.location.pathname === '/f2' || window.location.pathname.startsWith('/f2/')
            || (isAccountPage && (requestedSeries === 'f2' || (!requestedSeries && rememberedSeries === 'f2')));
        try { localStorage.setItem('racelytic-series', isF2Mode ? 'f2' : 'f1'); } catch {}
        document.body.classList.toggle('f2-mode', isF2Mode);
        if (!isF2Mode && !document.title.includes('Formula 1')) {
            document.title = document.title === 'Racelytic'
                ? 'Formula 1 · Racelytic'
                : `${document.title.replace(/\s*·\s*Racelytic$/, '')} · Formula 1 · Racelytic`;
        }
        const brand = container.querySelector('.brand');
        if (brand) brand.href = isF2Mode ? '/f2' : '/';

        let favicon = document.querySelector('link[rel~="icon"]');
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = 'icon';
            favicon.type = 'image/svg+xml';
            document.head.appendChild(favicon);
        }
        favicon.href = isF2Mode
            ? '/assets/favicon-f2.svg'
            : '/assets/favicon-f1.svg';

        container.querySelectorAll('.series-switcher a').forEach(link => {
            const active = link.dataset.series === (isF2Mode ? 'f2' : 'f1');
            if (isAccountPage) link.href = `/account?series=${link.dataset.series}`;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
        });
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
            databaseLinks.forEach((link, index) => {
                if (![0, 1, 2, 3, 4, 5].includes(index)) link.remove();
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
                '/f2/championship-builder': ['FORMULA 2 CHAMPIONSHIP BUILDER', 'Your weekends. Your rules.', 'Combine Formula 2 weekends, choose the field and calculate a custom championship.'],
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
        };

        mobileToggle?.addEventListener('click', event => {
            event.stopPropagation();
            const open = mainNav.classList.toggle('is-open');
            mobileToggle.setAttribute('aria-expanded', String(open));
            mobileToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
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
        if (accountLink) accountLink.href = `/account?series=${isF2Mode ? 'f2' : 'f1'}`;
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
        if (isF2Mode) {
            const paragraphs = footer.querySelectorAll('p');
            const brand = footer.querySelector('.footer-brand');
            if (brand) brand.href = '/f2';
            if (paragraphs[0]) paragraphs[0].textContent = 'Independent Formula 2 history, statistics, and championship analysis.';
            if (paragraphs[2]) paragraphs[2].textContent = 'Racelytic is an unofficial, independent project and is not affiliated with Formula 2, the FIA, or any Formula 2 team. Formula 2, F2, and related marks are trademarks of their respective owners.';
            if (paragraphs[3]) paragraphs[3].textContent = 'Formula 2 statistics are compiled from the project dataset and Motorsport Stats. Data may contain errors and should not be treated as an official record.';
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
            <p>Sam Nijsten uses optional first-party analytics to count visits, pages viewed and active time. If allowed, Racelytic stores a random visitor ID in your browser for up to 13 months. No advertising trackers are used. <a href="/privacy#choices">Privacy Notice</a></p>
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
