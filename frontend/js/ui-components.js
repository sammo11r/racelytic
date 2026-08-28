(function initialiseUiComponents(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RacelyticUI = api;
})(typeof window === 'undefined' ? null : window, function createUiComponents() {
    const escape = value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    const state = (kind, message) => `<div class="ui-state ${kind}-state">${escape(message)}</div>`;
    const loading = (message = 'Loading…') => state('loading', message);
    const empty = (message = 'No results found.') => state('empty', message);
    const error = (message = 'Unable to load data.') => `<div class="ui-state error" role="alert">${escape(message)}</div>`;

    function setState(target, kind, message) {
        const element = typeof target === 'string' && typeof document !== 'undefined' ? document.getElementById(target) : target;
        if (!element) return;
        element.innerHTML = kind === 'loading' ? loading(message) : kind === 'empty' ? empty(message) : error(message);
    }

    function bindFilters(inputs, render) {
        const elements = (Array.isArray(inputs) ? inputs : [inputs]).filter(Boolean);
        const listener = () => render(Object.fromEntries(elements.map(element => [element.name || element.id, element.value])));
        elements.forEach(element => element.addEventListener(element.matches?.('input[type="search"]') ? 'input' : 'change', listener));
        return () => elements.forEach(element => element.removeEventListener(element.matches?.('input[type="search"]') ? 'input' : 'change', listener));
    }

    function table({ columns, rows, emptyMessage = 'No results found.', row = values => values }) {
        if (!rows?.length) return empty(emptyMessage);
        const head = columns.map(column => `<th>${escape(column.label ?? column)}</th>`).join('');
        const body = rows.map(item => `<tr>${row(item).map(value => `<td>${value ?? '—'}</td>`).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function chart(content, label) {
        return `<div class="chart-frame"${label ? ` role="img" aria-label="${escape(label)}"` : ''}>${content}</div>`;
    }

    return Object.freeze({ bindFilters, chart, empty, error, escape, loading, setState, table });
});
