(function initialiseSeriesConfig(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RacelyticSeries = api;
})(typeof window === 'undefined' ? null : window, function createSeriesConfig() {
    const series = {
        f1: { key: 'f1', name: 'Formula 1', shortName: 'F1', path: '', modeClass: '', favicon: '/assets/favicon-f1.svg', entity: 'constructor' },
        f2: { key: 'f2', name: 'Formula 2', shortName: 'F2', path: '/f2', modeClass: 'f2-mode', favicon: '/assets/favicon-f2.svg', entity: 'constructor' },
        f3: { key: 'f3', name: 'Formula 3', shortName: 'F3', path: '/f3', modeClass: 'f3-mode', favicon: '/assets/favicon-f3.svg', entity: 'team' },
        academy: { key: 'academy', name: 'F1 Academy', shortName: 'F1 Academy', path: '/academy', modeClass: 'academy-mode', favicon: '/assets/favicon-academy.svg', entity: 'team' },
    };

    function fromPath(pathname = typeof window === 'undefined' ? '/' : window.location.pathname) {
        const key = pathname === '/academy' || pathname.startsWith('/academy/') ? 'academy'
            : pathname === '/f3' || pathname.startsWith('/f3/') ? 'f3'
            : pathname === '/f2' || pathname.startsWith('/f2/') ? 'f2' : 'f1';
        return series[key];
    }

    function pageUrl(seriesKey, page = '', query = '') {
        const config = series[seriesKey] || series.f1;
        const normalizedPage = page ? `/${String(page).replace(/^\/+/, '')}` : '';
        return `${config.path}${normalizedPage}${query}` || '/';
    }

    return Object.freeze({ all: Object.freeze(series), fromPath, pageUrl });
});
