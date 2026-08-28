(function initialiseSearchModule() {
    function init(container, activeSeries) {
        const searchInput = container.querySelector('#global-search-input');
        const searchResults = container.querySelector('#global-search-results');
        let searchTimer;
        let searchController;
        let activeSearchIndex = -1;
        let inlineCompletionQuery;
        
        const safeText = value => String(value ?? '')
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
        
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
            if (inlineCompletionQuery === undefined || !searchInput) return;
            searchInput.value = inlineCompletionQuery;
            searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
            inlineCompletionQuery = undefined;
        };
        
        const applyInlineCompletion = (payload, query) => {
            if (!searchInput || document.activeElement !== searchInput || searchInput.value.trim() !== query) return;
            const completion = String(payload?.completion || '');
            if (!completion || completion.length <= query.length) return;
            inlineCompletionQuery = query;
            searchInput.value = completion;
            searchInput.setSelectionRange(query.length, searchInput.value.length);
        };
        
        const closeSearch = () => {
            window.clearTimeout(searchTimer);
            searchController?.abort();
            searchController = undefined;
            if (!searchResults) return;
            clearActiveSearchResult();
            searchResults.hidden = true;
            searchInput?.setAttribute('aria-expanded', 'false');
        };
        
        const renderSearchResults = (payload, query) => {
            if (!searchResults) return;
            const groups = payload?.groups || [];
            const seriesLabel = { f1: 'F1', f2: 'F2', f3: 'F3', academy: 'Academy' };
            let resultIndex = 0;
            searchResults.innerHTML = groups.length ? `${groups.map(group => `
                <section class="global-search-group" role="group" aria-label="${safeText(group.label)}">
                    <div class="global-search-group-title">${safeText(group.label)}</div>
                    ${group.results.map(result => {
                        const series = Array.isArray(result.series) ? result.series : [result.series];
                        return `<a id="global-search-option-${resultIndex++}" href="${safeText(result.url)}" class="global-search-result" role="option" aria-selected="false">
                            <span>${safeText(result.type)}</span>
                            <strong>${safeText(result.label)}</strong>
                            <small>${safeText(result.meta)}</small>
                            <em>${series.filter(Boolean).map(key => `<i>${safeText(seriesLabel[key] || key)}</i>`).join('')}</em>
                        </a>`;
                    }).join('')}
                </section>
            `).join('')}<a id="global-search-option-${resultIndex}" class="global-search-all" role="option" aria-selected="false" href="/search?q=${encodeURIComponent(query)}&context=${encodeURIComponent(activeSeries)}">View all ${safeText(payload.total)} results <span aria-hidden="true">→</span></a>`
                : '<div class="global-search-empty">No matching pages or database entries.</div>';
            clearActiveSearchResult();
            searchResults.hidden = false;
            searchInput.setAttribute('aria-expanded', 'true');
            applyInlineCompletion(payload, query);
        };
        
        searchInput?.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            searchController?.abort();
            searchController = undefined;
            inlineCompletionQuery = undefined;
            clearActiveSearchResult();
            const query = searchInput.value.trim();
            if (query.length < 2) {
                closeSearch();
                return;
            }
            searchTimer = window.setTimeout(async () => {
                const controller = new AbortController();
                searchController = controller;
                searchResults.hidden = false;
                searchResults.innerHTML = '<div class="global-search-empty">Searching…</div>';
                searchInput.setAttribute('aria-expanded', 'true');
                try {
                    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&context=${encodeURIComponent(activeSeries)}`, { signal: controller.signal });
                    if (!response.ok) throw new Error('Search failed');
                    const payload = await response.json();
                    if (searchController === controller && searchInput.value.trim() === query) renderSearchResults(payload, query);
                } catch (error) {
                    if (error.name === 'AbortError' || searchController !== controller) return;
                    console.error('Search error:', error);
                    searchResults.innerHTML = '<div class="global-search-empty">Search is temporarily unavailable.</div>';
                } finally {
                    if (searchController === controller) searchController = undefined;
                }
            }, 180);
        });
        
        searchInput?.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                restoreTypedSearchQuery();
                closeSearch();
                searchInput.focus();
            }
            if ((event.key === 'Tab' || event.key === 'ArrowRight')
                && inlineCompletionQuery !== undefined
                && searchInput.selectionStart === inlineCompletionQuery.length
                && searchInput.selectionEnd === searchInput.value.length) {
                event.preventDefault();
                searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
                inlineCompletionQuery = undefined;
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
