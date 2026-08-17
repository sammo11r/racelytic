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
    } catch (error) {
        console.error('Footer error:', error);
    }
}

loadFooter();
