(function () {
  'use strict';

  function escapeMapHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  window.renderJuniorSeasonMap = async function renderJuniorSeasonMap(containerId, races, options = {}) {
    const container = document.getElementById(containerId);
    const mappedRaces = races.filter(race =>
      race.latitude !== null && race.latitude !== undefined &&
      race.longitude !== null && race.longitude !== undefined &&
      Number.isFinite(Number(race.latitude)) && Number.isFinite(Number(race.longitude))
    );
    if (!container || !window.d3 || !window.topojson || !mappedRaces.length) {
      if (container) container.innerHTML = '<div class="season-map-loading">Map data unavailable.</div>';
      return;
    }

    const raceName = race => race.name || race.officialName || `Round ${race.round}`;
    try {
      const response = await fetch('/data/countries-110m.json');
      if (!response.ok) throw new Error('World map could not be loaded.');
      const world = await response.json();
      const countries = window.topojson.feature(world, world.objects.countries);
      container.innerHTML = `
        <svg class="season-map-svg" role="img" aria-label="World map showing the ${escapeMapHtml(options.year)} ${escapeMapHtml(options.seriesName)} calendar route"></svg>
        <div class="season-map-controls" role="group" aria-label="Map zoom controls">
          <button type="button" data-map-action="zoom-in" aria-label="Zoom in">+</button>
          <button type="button" data-map-action="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" class="season-map-reset" data-map-action="reset">Reset</button>
        </div>
        <div class="season-map-help">Drag to pan · Pinch to zoom</div>
        <div class="season-map-tooltip" role="status" aria-live="polite"></div>`;

      const svg = window.d3.select(container).select('svg');
      const tooltip = container.querySelector('.season-map-tooltip');
      let viewport;
      let stops;
      let markerPosition;
      let currentTransform = window.d3.zoomIdentity;
      const positionMarkers = () => {
        if (!stops || !markerPosition) return;
        const inverseScale = 1 / currentTransform.k;
        stops.attr('transform', race => `${markerPosition(race)} scale(${inverseScale})`);
      };
      const zoom = window.d3.zoom().scaleExtent([1, 8])
        .filter(event => event.type !== 'wheel' && !event.button)
        .on('zoom', event => {
          currentTransform = event.transform;
          viewport?.attr('transform', currentTransform);
          positionMarkers();
          tooltip.classList.remove('visible');
        });

      const draw = () => {
        const width = Math.max(container.clientWidth, 320);
        const height = Math.max(310, Math.min(520, width * 0.46));
        const projection = window.d3.geoNaturalEarth1().fitExtent([[18, 18], [width - 18, height - 18]], { type: 'Sphere' });
        const path = window.d3.geoPath(projection);
        markerPosition = race => `translate(${projection([Number(race.longitude), Number(race.latitude)])})`;
        svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove();
        viewport = svg.append('g').attr('class', 'season-map-viewport');
        viewport.append('path').datum({ type: 'Sphere' }).attr('class', 'map-ocean').attr('d', path);
        viewport.append('g').selectAll('path').data(countries.features).join('path').attr('class', 'map-country').attr('d', path);
        viewport.append('path').datum({ type: 'LineString', coordinates: mappedRaces.map(race => [Number(race.longitude), Number(race.latitude)]) })
          .attr('class', 'calendar-route').attr('d', path);
        stops = viewport.append('g').selectAll('g').data(mappedRaces).join('g')
          .attr('class', 'calendar-stop').attr('role', 'button').attr('tabindex', 0)
          .attr('aria-label', race => `Round ${race.round}: ${raceName(race)}`);
        stops.append('circle').attr('class', 'calendar-stop-hit').attr('r', 14);
        stops.append('circle').attr('class', 'calendar-stop-marker').attr('r', 8);
        stops.append('text').attr('text-anchor', 'middle').attr('dy', '.34em').text(race => race.round);
        const activate = (event, race) => {
          const point = window.d3.pointer(event, container);
          tooltip.innerHTML = `<strong>Round ${escapeMapHtml(race.round)}</strong><span>${escapeMapHtml(raceName(race))}</span><small>${escapeMapHtml(race.circuitName || race.placeName || '')}</small>`;
          tooltip.style.left = `${Math.min(point[0] + 14, container.clientWidth - 235)}px`;
          tooltip.style.top = `${Math.max(point[1] - 35, 10)}px`;
          tooltip.classList.add('visible');
          document.querySelectorAll('.calendar-race.map-active').forEach(card => card.classList.remove('map-active'));
          document.querySelector(`.calendar-race[data-round="${race.round}"]`)?.classList.add('map-active');
        };
        stops.on('mouseenter focus', activate).on('mouseleave blur', () => tooltip.classList.remove('visible'))
          .on('click keydown', (event, race) => {
            if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
            if (event.type === 'keydown') event.preventDefault();
            activate(event, race);
            document.querySelector(`.calendar-race[data-round="${race.round}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        zoom.extent([[0, 0], [width, height]]).translateExtent([[0, 0], [width, height]]);
        svg.call(zoom).call(zoom.transform, currentTransform);
        positionMarkers();
      };
      container.querySelector('[data-map-action="zoom-in"]')?.addEventListener('click', () => svg.transition().duration(180).call(zoom.scaleBy, 1.5));
      container.querySelector('[data-map-action="zoom-out"]')?.addEventListener('click', () => svg.transition().duration(180).call(zoom.scaleBy, 1 / 1.5));
      container.querySelector('[data-map-action="reset"]')?.addEventListener('click', () => svg.transition().duration(220).call(zoom.transform, window.d3.zoomIdentity));
      draw();
      new ResizeObserver(draw).observe(container);
    } catch (error) {
      console.error('Calendar map error:', error);
      container.innerHTML = `<div class="season-map-loading">${escapeMapHtml(error.message)}</div>`;
    }
  };
})();
