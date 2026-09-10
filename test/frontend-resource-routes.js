const { resourcePath, slugify } = require('../backend/resource-routes');

function resourceUrl(resource, id, { base = '', label = '', query } = {}) {
    let url = resourcePath(base.replace(/^\//, '') || 'f1', resource, id, resource === 'race' ? label : '');
    const search = query instanceof URLSearchParams ? query.toString() : String(query || '').replace(/^\?/, '');
    return `${url}${search ? `?${search}` : ''}`;
}

function resourceIdFrom(query) {
    return resource => new URLSearchParams(query()).get(resource === 'season' ? 'year' : 'id') || '';
}

module.exports = { resourceUrl, resourceIdFrom, slugify };
