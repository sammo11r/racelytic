(function initialiseSearchModule() {
    function init(container, activeSeries) {
        const searchInput = container.querySelector('#global-search-input');
        const searchResults = container.querySelector('#global-search-results');
        let searchTimer;
        let searchController;
        let activeSearchIndex = -1;
        let searchAllSeries = false;
        
        const safeText = value => String(value ?? '')
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

        const highlightedText = (value, query) => {
            const text = String(value ?? '');
            const needle = String(query || '').trim();
            const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
            if (!needle || index < 0) return safeText(text);
            return `${safeText(text.slice(0, index))}<mark>${safeText(text.slice(index, index + needle.length))}</mark>${safeText(text.slice(index + needle.length))}`;
        };

        const setStatus = message => {
            const status = container.querySelector('#global-search-status');
            if (status) status.textContent = message;
        };
        
        const searchOptions = () => [...(searchResults?.querySelectorAll('[role="option"]') || [])];
        
        const setActiveSearchResult = index => {
            const options = searchOptions();
            if (!options.length) return;
            activeSearchIndex = (index + options.length) % options.length;
            options.forEach((option, optionIndex) => {
                const active = optionIndex === activeSearchIndex;
                option.classList.toggle('is-active', active);
                option.setAttribute('aria-selected', String(active));
            });
            const activeOption = options[activeSearchIndex];
            searchInput?.setAttribute('aria-activedescendant', activeOption.id);
            activeOption.scrollIntoView({ block: 'nearest' });
        };
        
        const clearActiveSearchResult = () => {
            activeSearchIndex = -1;
            searchInput?.removeAttribute('aria-activedescendant');
            searchOptions().forEach(option => {
                option.classList.remove('is-active');
                option.setAttribute('aria-selected', 'false');
            });
        };
        
        const restoreTypedSearchQuery = () => {
            if (!searchInput) return;
            searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
        };
        
        const closeSearch = () => {
            window.clearTimeout(searchTimer);
            searchController?.abort();
            searchController = undefined;
            if (!searchResults) return;
            clearActiveSearchResult();
            searchResults.hidden = true;
            searchInput?.setAttribute('aria-expanded', 'false');
            searchInput?.removeAttribute('aria-busy');
        };

        const searchUrl = query => {
            const params = new URLSearchParams({ q: query, context: activeSeries });
            if (!searchAllSeries) params.set('series', activeSeries);
            return `/api/search?${params}`;
        };

        const runSearch = async query => {
            searchController?.abort();
            const controller = new AbortController();
            searchController = controller;
            searchResults.hidden = false;
            searchResults.innerHTML = '<div class="global-search-empty">Searching…</div>';
            searchInput.setAttribute('aria-expanded', 'true');
            searchInput.setAttribute('aria-busy', 'true');
            setStatus('Searching');
            try {
                const response = await fetch(searchUrl(query), { signal: controller.signal });
                if (!response.ok) throw new Error('Search failed');
                const payload = await response.json();
                if (searchController === controller && searchInput.value.trim() === query) renderSearchResults(payload, query);
            } catch (error) {
                if (error.name === 'AbortError' || searchController !== controller) return;
                console.error('Search error:', error);
                searchResults.innerHTML = '<div class="global-search-empty"><strong>Search is temporarily unavailable.</strong><button type="button" data-search-retry>Try again</button></div>';
                setStatus('Search is temporarily unavailable.');
            } finally {
                if (searchController === controller) {
                    searchController = undefined;
                    searchInput.removeAttribute('aria-busy');
                }
            }
        };
        
        const renderSearchResults = (payload, query) => {
            if (!searchResults) return;
            const groups = payload?.groups || [];
            const seriesLabel = { f1: 'F1', f2: 'F2', f3: 'F3', academy: 'Academy' };
            let resultIndex = 0;
            const scopeLabel = searchAllSeries ? 'All series' : ({ f1: 'F1', f2: 'F2', f3: 'F3', academy: 'F1 Academy' }[activeSeries] || 'Current series');
            const scopeControls = `<div class="global-search-scope" aria-label="Search scope">
                <span>Searching ${safeText(scopeLabel)}</span>
                <button type="button" data-search-scope="${searchAllSeries ? 'current' : 'all'}">${searchAllSeries ? 'Current series only' : 'Search all series'}</button>
            </div>`;
            searchResults.innerHTML = groups.length ? `${scopeControls}<div id="global-search-list" role="listbox">${groups.map(group => `
                <section class="global-search-group" role="group" aria-label="${safeText(group.label)}">
                    <div class="global-search-group-title">${safeText(group.label)}</div>
                    ${group.results.map(result => {
                        const series = Array.isArray(result.series) ? result.series : [result.series];
                        return `<a id="global-search-option-${resultIndex++}" href="${safeText(result.url)}" class="global-search-result" role="option" aria-selected="false">
                            <span>${safeText(result.type)}</span>
                            <strong>${highlightedText(result.label, query)}</strong>
                            <small>${safeText(result.meta)}</small>
                            <em>${series.filter(Boolean).map(key => `<i>${safeText(seriesLabel[key] || key)}</i>`).join('')}</em>
                        </a>`;
                    }).join('')}
                </section>
            `).join('')}<a id="global-search-option-${resultIndex}" class="global-search-all" role="option" aria-selected="false" href="/search?q=${encodeURIComponent(query)}&context=${encodeURIComponent(activeSeries)}${searchAllSeries ? '' : `&series=${encodeURIComponent(activeSeries)}`}">View all ${safeText(payload.total)} results <span aria-hidden="true">→</span></a></div>`
                : `${scopeControls}<div class="global-search-empty"><strong>No matches in ${safeText(scopeLabel)}.</strong>${searchAllSeries ? '<span>Try another spelling or a broader term.</span>' : '<button type="button" data-search-scope="all">Search all series</button>'}</div>`;
            clearActiveSearchResult();
            searchResults.hidden = false;
            searchInput.setAttribute('aria-expanded', 'true');
            setStatus(`${payload.total} result${payload.total === 1 ? '' : 's'} available in ${scopeLabel}.`);
        };

        searchResults?.addEventListener('click', event => {
            const scopeButton = event.target.closest('[data-search-scope]');
            const retryButton = event.target.closest('[data-search-retry]');
            if (!scopeButton && !retryButton) return;
            event.preventDefault();
            searchAllSeries = scopeButton ? scopeButton.dataset.searchScope === 'all' : searchAllSeries;
            restoreTypedSearchQuery();
            const query = searchInput.value.trim();
            if (query.length >= 2) runSearch(query);
        });
        
        searchInput?.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            searchController?.abort();
            searchController = undefined;
            clearActiveSearchResult();
            const query = searchInput.value.trim();
            if (query.length < 2) {
                closeSearch();
                return;
            }
            searchTimer = window.setTimeout(() => runSearch(query), 180);
        });
        
        searchInput?.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                restoreTypedSearchQuery();
                closeSearch();
                if (container.querySelector('.main-nav')?.classList.contains('is-search-open')) {
                    container.dispatchEvent(new CustomEvent('racelytic-search-escape'));
                } else {
                    searchInput.focus();
                }
            }
            if (event.key === 'ArrowDown' && !searchResults?.hidden) {
                event.preventDefault();
                setActiveSearchResult(activeSearchIndex + 1);
            }
            if (event.key === 'ArrowUp' && !searchResults?.hidden) {
                event.preventDefault();
                setActiveSearchResult(activeSearchIndex <= 0 ? searchOptions().length - 1 : activeSearchIndex - 1);
            }
            if (event.key === 'Enter') {
                const activeResult = searchOptions()[activeSearchIndex];
                if (activeResult && !searchResults.hidden) {
                    event.preventDefault();
                    activeResult.click();
                } else if (searchInput.value.trim().length >= 2) {
                    event.preventDefault();
                    window.location.href = `/search?q=${encodeURIComponent(searchInput.value.trim())}&context=${encodeURIComponent(activeSeries)}`;
                }
            }
        });
        
        
        return { closeSearch, restoreTypedSearchQuery };
    }

    window.RacelyticSearch = Object.freeze({ init });
})();
