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

        const isF2Mode = window.location.pathname === '/f2' || window.location.pathname.startsWith('/f2/');
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
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
        });
        if (isF2Mode) {
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
            const f2LandingPages = ['/f2/analysis', '/f2/simulator', '/f2/games'];
            navigationDropdowns.slice(1).forEach((dropdown, index) => {
                dropdown.classList.add('f2-direct-nav');
                dropdown.querySelector('.dropdown-menu')?.remove();
                const toggle = dropdown.querySelector('.dropdown-toggle');
                if (toggle) {
                    const link = document.createElement('a');
                    link.className = 'nav-link';
                    link.href = f2LandingPages[index];
                    link.textContent = toggle.childNodes[0]?.textContent.trim() || '';
                    toggle.replaceWith(link);
                }
            });
            const aboutLink = container.querySelector('a[href="/about"]');
            if (aboutLink) aboutLink.href = '/f2/about';
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
            if (linkPath === window.location.pathname) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
                link.closest('.nav-dropdown')?.querySelector('.dropdown-toggle')?.classList.add('active');
            }
            link.addEventListener('click', closeMobileNavigation);
        });

        const accountLink = container.querySelector('#account-link');
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
    } catch (error) {
        console.error('Footer error:', error);
    }
}

loadFooter();
