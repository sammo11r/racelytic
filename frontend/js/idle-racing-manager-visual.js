(function idleRaceVisualModule(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IdleRacingManagerVisual = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIdleRaceVisualModule(root) {
  const TAU = Math.PI * 2;
  const DEFAULT_FIELD_SIZE = 20;
  const DEFAULT_LAP_DURATION_MS = 5000;
  const SVG_TRACKS = {
    'industrial-park': {
      elementId: 'irm-industrial-park-path',
      bounds: { left: 33.5, top: 48.8, right: 1094.5, bottom: 432.2 }
    },
    'ridgeway': {
      elementId: 'irm-ridgeway-path',
      bounds: { left: 65.7, top: 94, right: 1159, bottom: 503.2 }
    },
    'aurora-ring': {
      elementId: 'irm-aurora-ring-path',
      bounds: { left: 29.7, top: 59.3, right: 785.9, bottom: 580.3 }
    },
    'ember-coast': {
      elementId: 'irm-ember-coast-path',
      bounds: { left: -14.7, top: 125.1, right: 1165.9, bottom: 559.7 }
    },
    'blackstone-pass': {
      elementId: 'irm-blackstone-pass-path',
      bounds: { left: -3.4, top: 55.6, right: 1171.2, bottom: 606 }
    },
    'halcyon-circuit': {
      elementId: 'irm-halcyon-circuit-path',
      bounds: { left: 11.6, top: 57.6, right: 1153.4, bottom: 544.7 }
    }
  };
  const svgTrackCache = new Map();

  // Hand-placed corner waypoints per circuit (normalized 0-1), smoothed into a closed
  // loop with Catmull-Rom below. Point 0 is always the start/finish straight.
  const TRACK_WAYPOINTS = {
    'industrial-park': [
      [.48, .88], [.78, .88], [.91, .78], [.88, .57],
      [.67, .50], [.79, .34], [.72, .16], [.45, .13],
      [.34, .29], [.15, .23], [.10, .47], [.28, .60],
      [.14, .74], [.28, .88]
    ],
    'ridgeway': [
      [.50, .90], [.85, .90], [.94, .74],
      [.94, .54], [.76, .46], [.94, .38],
      [.94, .16], [.62, .08],
      [.40, .20], [.56, .34], [.28, .40],
      [.08, .28], [.08, .68],
      [.24, .78], [.08, .86],
      [.22, .92]
    ],
    'aurora-ring': [
      [.50, .90], [.82, .90], [.92, .76],
      [.92, .50], [.78, .42], [.92, .34],
      [.92, .14], [.66, .10],
      [.50, .24], [.34, .10],
      [.14, .18], [.10, .40],
      [.24, .52], [.10, .64],
      [.10, .82], [.24, .90]
    ]
  };

  // Lightweight fallbacks for non-DOM environments such as the pure Node tests.
  // Browser play uses each venue's exact SVG definition above.
  TRACK_WAYPOINTS['ember-coast'] = TRACK_WAYPOINTS['industrial-park'];
  TRACK_WAYPOINTS['blackstone-pass'] = TRACK_WAYPOINTS['ridgeway'];
  TRACK_WAYPOINTS['halcyon-circuit'] = TRACK_WAYPOINTS['aurora-ring'];

  function trackWaypoints(circuitId) {
    return TRACK_WAYPOINTS[circuitId] || TRACK_WAYPOINTS['industrial-park'];
  }

  function catmullRomComponent(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return .5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
  }

  function svgCircuitPoint(circuitId, progress) {
    const definition = SVG_TRACKS[circuitId];
    if (!definition || !root.document) return null;
    let track = svgTrackCache.get(circuitId);
    if (!track) {
      const path = root.document.getElementById(definition.elementId);
      if (!path?.getTotalLength || !path?.getPointAtLength) return null;
      track = { path, length: path.getTotalLength() };
      svgTrackCache.set(circuitId, track);
    }
    const wrapped = ((Number(progress) || 0) % 1 + 1) % 1;
    const point = track.path.getPointAtLength(track.length * wrapped);
    const { left, top, right, bottom } = definition.bounds;
    return {
      x: .08 + (point.x - left) / (right - left) * .84,
      y: .12 + (point.y - top) / (bottom - top) * .76
    };
  }

  function circuitPoint(circuitId, progress) {
    const svgPoint = svgCircuitPoint(circuitId, progress);
    if (svgPoint) return svgPoint;
    const points = trackWaypoints(circuitId);
    const count = points.length;
    const f = ((Number(progress) || 0) % 1 + 1) % 1 * count;
    const index = Math.floor(f);
    const t = f - index;
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index % count];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];
    return {
      x: catmullRomComponent(p0[0], p1[0], p2[0], p3[0], t),
      y: catmullRomComponent(p0[1], p1[1], p2[1], p3[1], t)
    };
  }

  const distanceLookups = new Map();

  function distanceLookup(circuitId) {
    const id = TRACK_WAYPOINTS[circuitId] ? circuitId : 'industrial-park';
    if (distanceLookups.has(id)) return distanceLookups.get(id);
    const samples = Array.from({ length: 481 }, (_, index) => circuitPoint(id, index / 480));
    const cumulative = [0];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      cumulative.push(cumulative[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y));
    }
    const lookup = { samples, cumulative, total: cumulative.at(-1) || 1 };
    distanceLookups.set(id, lookup);
    return lookup;
  }

  // Translate race progress into distance travelled, rather than waypoint index. This
  // keeps the field evenly spaced through chicanes and along the longest straights.
  function circuitDistancePoint(circuitId, progress) {
    const lookup = distanceLookup(circuitId);
    const wrapped = ((Number(progress) || 0) % 1 + 1) % 1;
    const target = wrapped * lookup.total;
    let low = 0, high = lookup.cumulative.length - 1;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (lookup.cumulative[middle] <= target) low = middle;
      else high = middle;
    }
    const from = lookup.samples[low], to = lookup.samples[high];
    const span = lookup.cumulative[high] - lookup.cumulative[low] || 1;
    const amount = (target - lookup.cumulative[low]) / span;
    return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
  }

  function easedPosition(current, target, deltaSeconds) {
    const strength = 1 - Math.pow(.05, Math.max(0, Number(deltaSeconds) || 0));
    return current + (target - current) * strength;
  }

  function create(canvas, options = {}) {
    if (!canvas?.getContext) return { start() {}, updateLap() {}, finish() {}, reset() {} };
    const context = canvas.getContext('2d');
    const getSpeed = options.getSpeed || (() => 1);
    const prefersReducedMotion = root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let animationFrame = 0;
    let lastTimestamp = 0;
    let phase = 0;
    let state = createIdleState(options.fieldSize);

    function createIdleState(fieldSize) {
      const size = Math.max(2, Number(fieldSize) || DEFAULT_FIELD_SIZE);
      return {
        running: false, circuitId: 'industrial-park', fieldSize: size,
        position: size, targetPosition: size, lap: 0, totalLaps: 1,
        lapDurationMs: DEFAULT_LAP_DURATION_MS,
        segmentFrom: 0, segmentTo: 0, segmentElapsedMs: 0
      };
    }

    // Begins a new lap-of-track animation segment: the dot travels from `from` to `to`
    // (both 0-1 track progress) over exactly one lapDurationMs window, so the visual
    // revolution finishes right as the next lap tick lands.
    function beginSegment(from, to) {
      state.segmentFrom = from;
      state.segmentTo = to;
      state.segmentElapsedMs = 0;
    }

    function sizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, root.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      return { width: rect.width, height: rect.height };
    }

    function mapPoint(point, width, height) {
      return { x: point.x * width, y: point.y * height };
    }

    function tracePath(trace, close = false) {
      context.beginPath();
      trace.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      if (close) context.closePath();
    }

    function drawCornerKerbs(trace) {
      const circularIndexDistance = (first, second) => {
        const difference = Math.abs(first - second);
        return Math.min(difference, trace.length - difference);
      };
      const pointToSegmentDistance = (point, start, end) => {
        const segmentX = end.x - start.x, segmentY = end.y - start.y;
        const lengthSquared = segmentX * segmentX + segmentY * segmentY || 1;
        const projection = Math.max(0, Math.min(1,
          ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared
        ));
        return Math.hypot(
          point.x - (start.x + segmentX * projection),
          point.y - (start.y + segmentY * projection)
        );
      };
      const metrics = trace.map((point, index) => {
        const previous = trace[(index - 2 + trace.length) % trace.length];
        const next = trace[(index + 2) % trace.length];
        const inX = point.x - previous.x, inY = point.y - previous.y;
        const outX = next.x - point.x, outY = next.y - point.y;
        const inLength = Math.hypot(inX, inY) || 1;
        const outLength = Math.hypot(outX, outY) || 1;
        const normalizedInX = inX / inLength, normalizedInY = inY / inLength;
        const normalizedOutX = outX / outLength, normalizedOutY = outY / outLength;
        return Math.atan2(
          normalizedInX * normalizedOutY - normalizedInY * normalizedOutX,
          normalizedInX * normalizedOutX + normalizedInY * normalizedOutY
        );
      });
      const isCorner = metrics.map((_, index) => {
        let strongestTurn = 0;
        for (let offset = -1; offset <= 1; offset += 1) {
          const turn = metrics[(index + offset + metrics.length) % metrics.length];
          if (Math.abs(turn) > Math.abs(strongestTurn)) strongestTurn = turn;
        }
        return Math.abs(strongestTurn) >= .09 ? Math.sign(strongestTurn) : 0;
      });
      const edgePoint = (index, turnDirection) => {
        const previous = trace[(index - 1 + trace.length) % trace.length];
        const point = trace[index];
        const next = trace[(index + 1) % trace.length];
        const tangentX = next.x - previous.x, tangentY = next.y - previous.y;
        const tangentLength = Math.hypot(tangentX, tangentY) || 1;
        const normalizedX = tangentX / tangentLength, normalizedY = tangentY / tangentLength;
        const normalX = turnDirection > 0 ? -normalizedY : normalizedY;
        const normalY = turnDirection > 0 ? normalizedX : -normalizedX;
        return { x: point.x + normalX * 9.5, y: point.y + normalY * 9.5 };
      };
      const hasTrackClearance = (index, points) => trace.every((otherStart, otherIndex) => {
        if (circularIndexDistance(index, otherIndex) <= 6) return true;
        const otherEnd = trace[(otherIndex + 1) % trace.length];
        return points.every(point => pointToSegmentDistance(point, otherStart, otherEnd) >= 15);
      });

      context.save();
      context.lineWidth = 4;
      context.lineCap = 'butt';
      context.lineJoin = 'round';
      let distance = 0;
      trace.forEach((point, index) => {
        const next = trace[(index + 1) % trace.length];
        const segmentX = next.x - point.x, segmentY = next.y - point.y;
        const segmentLength = Math.hypot(segmentX, segmentY) || 1;
        const nextIndex = (index + 1) % trace.length;
        const turnDirection = isCorner[index];
        const outsideStartFinish = circularIndexDistance(index, 3) > 5;
        if (turnDirection && turnDirection === isCorner[nextIndex] && outsideStartFinish) {
          const kerbStart = edgePoint(index, turnDirection);
          const kerbEnd = edgePoint(nextIndex, turnDirection);
          const kerbMiddle = {
            x: (kerbStart.x + kerbEnd.x) / 2,
            y: (kerbStart.y + kerbEnd.y) / 2
          };
          if (!hasTrackClearance(index, [kerbStart, kerbMiddle, kerbEnd])) {
            distance += segmentLength;
            return;
          }
          context.beginPath();
          context.moveTo(kerbStart.x, kerbStart.y);
          context.lineTo(kerbEnd.x, kerbEnd.y);
          context.strokeStyle = Math.floor(distance / 8) % 2 ? '#e52336' : '#f5f5f2';
          context.stroke();
        }
        distance += segmentLength;
      });
      context.restore();
    }

    // Draw a full-width checkered strip just ahead of the stationary car so both
    // the grid position and start/finish line remain legible.
    function drawStartFinish(trace) {
      const startIndex = 3;
      const start = trace[startIndex];
      const ahead = trace[(startIndex + 2) % trace.length];
      const dirX = ahead.x - start.x, dirY = ahead.y - start.y;
      const dirLen = Math.hypot(dirX, dirY) || 1;
      const angle = Math.atan2(dirY, dirX);
      const rows = 2, columns = 6;
      const bandLength = 8, bandWidth = 23;
      const cellLength = bandLength / rows, cellWidth = bandWidth / columns;
      context.save();
      context.translate(start.x, start.y);
      context.rotate(angle);
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          context.fillStyle = (row + column) % 2 ? '#111318' : '#fff';
          context.fillRect(
            -bandLength / 2 + row * cellLength,
            -bandWidth / 2 + column * cellWidth,
            cellLength + .3,
            cellWidth + .3
          );
        }
      }
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(255,255,255,.8)';
      context.strokeRect(-bandLength / 2, -bandWidth / 2, bandLength, bandWidth);
      context.restore();
    }

    function drawTrack(width, height) {
      const trace = Array.from({ length: 180 }, (_, index) => (
        mapPoint(circuitDistancePoint(state.circuitId, index / 180), width, height)
      ));

      context.save();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      const trackLayers = [[26, '#0b0e12'], [19, '#363d47'], [13, '#20242c']];
      for (const [lineWidth, colour] of trackLayers) {
        tracePath(trace, true);
        context.lineWidth = lineWidth;
        context.strokeStyle = colour;
        context.stroke();
      }
      drawCornerKerbs(trace);
      drawStartFinish(trace);
      context.restore();
    }

    function drawPlayerCar(width, height) {
      const point = mapPoint(circuitDistancePoint(state.circuitId, phase), width, height);
      context.save();
      const themeRoot = canvas.closest?.('.irm-game') || canvas;
      const accent = root.getComputedStyle?.(themeRoot).getPropertyValue('--accent').trim() || '#e10600';
      context.shadowColor = accent;
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(point.x, point.y, 6.5, 0, TAU);
      context.fillStyle = accent;
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = '#fff';
      context.stroke();
      context.shadowBlur = 3;
      context.fillStyle = '#fff';
      context.font = '800 8px system-ui,sans-serif';
      context.textAlign = 'center';
      context.fillText('YOU', point.x, point.y - 11);
      context.restore();
    }

    function draw() {
      const { width, height } = sizeCanvas();
      context.clearRect(0, 0, width, height);
      drawTrack(width, height);
      drawPlayerCar(width, height);
    }

    function updateLabel(message = '') {
      canvas.setAttribute('aria-label', message || (state.running
        ? `Animated race, lap ${state.lap} of ${state.totalLaps}, your car in position ${state.targetPosition}`
        : 'Race animation ready'));
    }

    function frame(timestamp) {
      if (!state.running) return;
      const delta = lastTimestamp ? Math.min(.1, (timestamp - lastTimestamp) / 1000) : 0;
      lastTimestamp = timestamp;
      if (!prefersReducedMotion) {
        state.segmentElapsedMs += delta * 1000 * Math.max(1, Number(getSpeed()) || 1);
        const t = state.lapDurationMs > 0 ? Math.min(1, state.segmentElapsedMs / state.lapDurationMs) : 1;
        phase = state.segmentFrom + (state.segmentTo - state.segmentFrom) * t;
      }
      state.position = easedPosition(state.position, state.targetPosition, delta);
      draw();
      animationFrame = root.requestAnimationFrame(frame);
    }

    function start({ circuitId, startPosition, totalLaps = 1, fieldSize, lapDurationMs } = {}) {
      root.cancelAnimationFrame(animationFrame);
      const size = Math.max(2, Number(fieldSize) || state.fieldSize || DEFAULT_FIELD_SIZE);
      phase = 0;
      lastTimestamp = 0;
      state = {
        running: true, circuitId, fieldSize: size,
        position: Math.max(1, Math.min(size, Number(startPosition) || size)),
        targetPosition: Math.max(1, Math.min(size, Number(startPosition) || size)),
        lap: 0, totalLaps: Math.max(1, Number(totalLaps) || 1),
        lapDurationMs: Math.max(1, Number(lapDurationMs) || DEFAULT_LAP_DURATION_MS),
        segmentFrom: 0, segmentTo: 0, segmentElapsedMs: 0
      };
      beginSegment(0, 1);
      updateLabel();
      draw();
      animationFrame = root.requestAnimationFrame(frame);
    }

    function updateLap({ lap, position }) {
      state.lap = lap;
      state.targetPosition = Math.max(1, Math.min(state.fieldSize, Number(position) || state.fieldSize));
      if (prefersReducedMotion) {
        // No animation to sync to a line crossing — just place the dot at overall race progress.
        phase = Math.min(1, lap / state.totalLaps);
        state.position = state.targetPosition;
      } else {
        // Each lap tick is one full trip around the circuit, so the counter only advances
        // (via the next updateLap call) exactly when the car crosses the start/finish line.
        beginSegment(0, 1);
      }
      updateLabel();
      if (prefersReducedMotion) draw();
    }

    function finish(position) {
      state.position = position;
      state.targetPosition = position;
      state.lap = state.totalLaps;
      state.running = false;
      phase = 0;
      updateLabel(`Race animation complete, your car finished in position ${position}`);
      root.cancelAnimationFrame(animationFrame);
      draw();
    }

    function reset(circuitId = 'industrial-park', fieldSize) {
      root.cancelAnimationFrame(animationFrame);
      phase = 0;
      state = createIdleState(fieldSize);
      state.circuitId = circuitId;
      updateLabel();
      draw();
    }

    root.addEventListener?.('resize', draw);
    const themeObserver = root.MutationObserver ? new root.MutationObserver(draw) : null;
    const themeTargets = new Set([
      root.document?.documentElement,
      root.document?.body,
      canvas.closest?.('.irm-game')
    ].filter(Boolean));
    themeTargets.forEach(target => themeObserver?.observe(target, {
      attributes: true,
      attributeFilter: ['class', 'style']
    }));
    reset(undefined, options.fieldSize);
    return { finish, reset, start, updateLap };
  }

  return { circuitDistancePoint, circuitPoint, create, easedPosition };
});
