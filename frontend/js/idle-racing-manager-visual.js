(function idleRaceVisualModule(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IdleRacingManagerVisual = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIdleRaceVisualModule(root) {
  const TAU = Math.PI * 2;

  function circuitPoint(circuitId, progress) {
    const angle = ((Number(progress) || 0) % 1 + 1) % 1 * TAU - Math.PI / 2;
    if (circuitId === 'ridgeway') {
      return {
        x: .5 + Math.cos(angle) * (.36 + Math.sin(angle * 3) * .045),
        y: .5 + Math.sin(angle) * .32 + Math.sin(angle * 2) * .055
      };
    }
    if (circuitId === 'aurora-ring') {
      return {
        x: .5 + Math.cos(angle) * .38 + Math.cos(angle * 2) * .055,
        y: .5 + Math.sin(angle) * (.3 + Math.cos(angle * 3) * .04)
      };
    }
    return {
      x: .5 + Math.cos(angle) * .39,
      y: .5 + Math.sin(angle) * .29 + Math.sin(angle * 2) * .025
    };
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
    let state = { running: false, circuitId: 'industrial-park', position: 14, targetPosition: 14, lap: 0, totalLaps: 1 };

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

    function drawTrack(width, height) {
      const trace = Array.from({ length: 120 }, (_, index) => (
        mapPoint(circuitPoint(state.circuitId, index / 120), width, height)
      ));
      context.save();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (const [lineWidth, colour] of [[24, '#080a0e'], [18, '#343b46'], [13, '#171b22']]) {
        context.beginPath();
        trace.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.closePath();
        context.lineWidth = lineWidth;
        context.strokeStyle = colour;
        context.stroke();
      }
      context.setLineDash([2, 7]);
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(255,255,255,.22)';
      context.stroke();
      context.setLineDash([]);
      const start = mapPoint(circuitPoint(state.circuitId, 0), width, height);
      context.fillStyle = '#f2f3f5';
      context.fillRect(start.x - 10, start.y - 2, 20, 4);
      context.restore();
    }

    function drawCar(rank, isPlayer, width, height) {
      const progress = phase - (rank - 1) * .015;
      const point = mapPoint(circuitPoint(state.circuitId, progress), width, height);
      context.save();
      const accent = isPlayer
        ? root.getComputedStyle?.(canvas).getPropertyValue('--accent').trim() || '#e10600'
        : '';
      context.shadowColor = isPlayer ? accent : 'rgba(0,0,0,.7)';
      context.shadowBlur = isPlayer ? 12 : 4;
      context.beginPath();
      context.arc(point.x, point.y, isPlayer ? 6.5 : 4, 0, TAU);
      context.fillStyle = isPlayer ? accent : rank <= 3 ? '#d7dbe1' : '#78818e';
      context.fill();
      if (isPlayer) {
        context.lineWidth = 2;
        context.strokeStyle = '#fff';
        context.stroke();
        context.shadowBlur = 3;
        context.fillStyle = '#fff';
        context.font = '800 8px system-ui,sans-serif';
        context.textAlign = 'center';
        context.fillText('YOU', point.x, point.y - 11);
      }
      context.restore();
    }

    function draw() {
      const { width, height } = sizeCanvas();
      context.clearRect(0, 0, width, height);
      drawTrack(width, height);
      const playerRank = Math.max(1, Math.min(14, Math.round(state.position)));
      for (let rank = 14; rank >= 1; rank -= 1) if (rank !== playerRank) drawCar(rank, false, width, height);
      drawCar(state.position, true, width, height);
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
      if (!prefersReducedMotion) phase = (phase + delta * .19 * Math.max(1, Number(getSpeed()) || 1)) % 1;
      state.position = easedPosition(state.position, state.targetPosition, delta);
      draw();
      animationFrame = root.requestAnimationFrame(frame);
    }

    function start({ circuitId, startPosition = 14, totalLaps = 1 }) {
      root.cancelAnimationFrame(animationFrame);
      phase = 0;
      lastTimestamp = 0;
      state = { running: true, circuitId, position: startPosition, targetPosition: startPosition, lap: 0, totalLaps };
      updateLabel();
      draw();
      animationFrame = root.requestAnimationFrame(frame);
    }

    function updateLap({ lap, position }) {
      state.lap = lap;
      state.targetPosition = position;
      updateLabel();
      if (prefersReducedMotion) {
        state.position = position;
        phase = lap / Math.max(1, state.totalLaps);
        draw();
      }
    }

    function finish(position) {
      state.position = position;
      state.targetPosition = position;
      state.lap = state.totalLaps;
      state.running = false;
      updateLabel(`Race animation complete, your car finished in position ${position}`);
      root.cancelAnimationFrame(animationFrame);
      draw();
    }

    function reset(circuitId = 'industrial-park') {
      root.cancelAnimationFrame(animationFrame);
      phase = 0;
      state = { running: false, circuitId, position: 14, targetPosition: 14, lap: 0, totalLaps: 1 };
      updateLabel();
      draw();
    }

    root.addEventListener?.('resize', draw);
    reset();
    return { finish, reset, start, updateLap };
  }

  return { circuitPoint, create, easedPosition };
});
