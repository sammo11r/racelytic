(() => {
  const engine = window.RacelyticReplay;
  const canvas = document.getElementById('replay-canvas');
  const trackPanel = canvas.parentElement;
  const context = canvas.getContext('2d');
  const yearSelect = document.getElementById('replay-year');
  const raceSelect = document.getElementById('replay-race');
  const order = document.getElementById('replay-order');
  const timeline = document.getElementById('replay-timeline');
  const playButton = document.getElementById('replay-play');
  const pauseButton = document.getElementById('replay-pause');
  const stagePlay = document.getElementById('replay-stage-play');
  const speedSelect = document.getElementById('replay-speed');
  const driverPicker = document.getElementById('replay-driver-picker');
  const driverOptions = document.getElementById('replay-driver-options');
  const driverCount = document.getElementById('replay-driver-count');
  let catalogue = [];
  let replay;
  let currentTime = 0;
  let playing = false;
  let lastFrameTime = 0;
  let lastLeaderboardSignature = '';
  let stabilizeLeaderboard = engine.createOrderStabilizer(1);
  let visibleDriverIds = new Set();
  let transformCache;
  let loadSequence = 0;
  const replayControls = [playButton, pauseButton, stagePlay, speedSelect, timeline,
    document.getElementById('replay-forward'), document.getElementById('replay-restart')];

  function setReplayControlsEnabled(enabled) {
    replayControls.forEach(control => { control.disabled = !enabled; });
  }

  function updateDriverCount() {
    const total = replay?.drivers?.length || 0;
    driverCount.textContent = `${visibleDriverIds.size}/${total}`;
  }

  function setAllDriversVisible(visible) {
    if (!replay) return;
    visibleDriverIds = new Set(visible ? replay.drivers.map(driver => driver.id) : []);
    driverOptions.querySelectorAll('input').forEach(input => { input.checked = visible; });
    updateDriverCount();
    lastLeaderboardSignature = '';
    render(true);
  }

  function populateDriverOptions(drivers) {
    visibleDriverIds = new Set(drivers.map(driver => driver.id));
    driverOptions.replaceChildren(...drivers.map(driver => {
      const option = document.createElement('label');
      option.className = 'replay-driver-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.value = driver.id;
      checkbox.setAttribute('aria-label', `Show ${driver.name}`);
      const colour = document.createElement('i');
      colour.style.background = driver.colour || '#888';
      const copy = document.createElement('span');
      const code = document.createElement('strong');
      code.textContent = driver.code;
      const name = document.createElement('small');
      name.textContent = `${driver.name} · ${driver.team}`;
      copy.append(code, name);
      option.append(checkbox, colour, copy);
      return option;
    }));
    updateDriverCount();
    driverPicker.hidden = false;
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load replay data (${response.status})`);
    return response.json();
  }

  function sizeCanvas() {
    const rect = trackPanel.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  function coordinateTransform(width, height, trace) {
    if (transformCache?.width === width && transformCache?.height === height && transformCache.trace === trace) {
      return transformCache.transform;
    }
    const padding = Math.max(34, Math.min(width, height) * .075);
    const source = trace.map(([x, y]) => ({ x, y: 1 - y }));
    const sourceBounds = source.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const sourceWidth = Math.max(.001, sourceBounds.maxX - sourceBounds.minX);
    const sourceHeight = Math.max(.001, sourceBounds.maxY - sourceBounds.minY);
    const fittedScale = Math.min(
      (width - padding * 2) / sourceWidth,
      (height - padding * 2) / sourceHeight
    );
    const drawnWidth = sourceWidth * fittedScale;
    const drawnHeight = sourceHeight * fittedScale;
    const offsetX = (width - drawnWidth) / 2;
    const offsetY = (height - drawnHeight) / 2;
    const transform = (x, y) => ({
      x: offsetX + (x - sourceBounds.minX) * fittedScale,
      y: offsetY + (1 - y - sourceBounds.minY) * fittedScale
    });
    transformCache = { width, height, trace, transform };
    return transform;
  }

  function strokeTrack(path, startLine) {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = 'rgba(0,0,0,.65)';
    context.shadowBlur = 24;
    context.lineWidth = 36;
    context.strokeStyle = '#07090d';
    context.stroke(path);
    context.shadowBlur = 0;
    context.lineWidth = 30;
    context.strokeStyle = '#616873';
    context.stroke(path);
    context.lineWidth = 25;
    context.strokeStyle = '#252a32';
    context.stroke(path);
    context.setLineDash([2, 8]);
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(255,255,255,.2)';
    context.stroke(path);
    context.setLineDash([]);
    if (startLine) {
      const { start, next } = startLine;
      const dx = next.x - start.x;
      const dy = next.y - start.y;
      const length = Math.hypot(dx, dy) || 1;
      const normalX = -dy / length * 15;
      const normalY = dx / length * 15;
      context.lineWidth = 3;
      context.strokeStyle = '#f3f4f6';
      context.beginPath();
      context.moveTo(start.x - normalX, start.y - normalY);
      context.lineTo(start.x + normalX, start.y + normalY);
      context.stroke();
      context.lineWidth = 3;
      context.strokeStyle = '#e10600';
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(start.x + normalX, start.y + normalY);
      context.stroke();
    }
    context.restore();
  }

  function gridStartLine(trackPoints) {
    if (trackPoints.length < 2) return null;
    return { start: trackPoints[0], next: trackPoints[1] };
  }

  function drawDriver(driver, x, y, compact, occupiedLabels) {
    context.save();
    context.beginPath();
    context.arc(x, y, compact ? 7 : 9, 0, Math.PI * 2);
    context.fillStyle = driver.colour || '#888';
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#f5f6f7';
    context.stroke();
    const labelIsClear = occupiedLabels.every(point => Math.hypot(point.x - x, point.y - y) > 30);
    if (!compact && labelIsClear) {
      occupiedLabels.push({ x, y });
      context.font = '800 9px system-ui,sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillStyle = '#fff';
      context.shadowColor = '#000';
      context.shadowBlur = 4;
      context.fillText(driver.code, x, y - 13);
    }
    context.restore();
  }

  function drawReplay(state) {
    if (!replay) return;
    const { width, height } = sizeCanvas();
    context.clearRect(0, 0, width, height);
    const compact = width < 560;
    const transform = coordinateTransform(width, height, replay.track.trace);
    const occupiedLabels = [];
    const points = replay.track.trace.map(([x, y]) => transform(x, y));
    const path = new Path2D();
    if (points.length > 1) {
      const first = points[0];
      const last = points.at(-1);
      path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    }
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const next = points[(index + 1) % points.length];
      path.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    path.closePath();
    const startLine = gridStartLine(points);
    strokeTrack(path, startLine);
    state.drivers.filter(driver => !['OUT', 'DNS'].includes(driver.statusText)).forEach(driver => {
      const position = transform(driver.x, driver.y);
      drawDriver(driver, position.x, position.y, compact, occupiedLabels);
    });
  }

  function createDriverRow(driver, index) {
    const row = document.createElement('li');
    row.className = 'replay-driver-row';
    const position = document.createElement('b');
    position.textContent = index + 1;
    const colour = document.createElement('i');
    colour.className = 'replay-driver-colour';
    colour.style.background = driver.colour;
    const copy = document.createElement('span');
    copy.className = 'replay-driver-copy';
    const code = document.createElement('strong');
    code.textContent = `${driver.code} · ${driver.name}`;
    const team = document.createElement('small');
    team.textContent = driver.team;
    copy.append(code, team);
    const status = document.createElement('span');
    status.className = `replay-driver-status${['OUT', 'DNS'].includes(driver.statusText) ? ' out' : ''}`;
    status.textContent = driver.statusText;
    row.append(position, colour, copy, status);
    return row;
  }

  function updateLeaderboard(state, force = false) {
    const drivers = stabilizeLeaderboard(
      state.drivers,
      state.time,
      force || state.time >= Number(replay?.duration || Infinity)
    );
    const signature = drivers.map(driver => `${driver.id}:${driver.statusText}`).join('|');
    if (!force && signature === lastLeaderboardSignature) return;
    lastLeaderboardSignature = signature;
    order.replaceChildren(...drivers.map(createDriverRow));
  }

  function updateHud(state) {
    document.getElementById('replay-session-time').textContent = engine.formatTime(state.time);
    document.getElementById('replay-lap-current').textContent = Math.min(state.lap, replay.totalLaps || state.lap);
    document.getElementById('replay-lap-total').textContent = replay.totalLaps || '—';
    document.getElementById('replay-elapsed').textContent = engine.formatTime(state.time);
    document.getElementById('replay-duration').textContent = engine.formatTime(replay.duration);
    const progress = state.time / replay.duration * 100;
    document.getElementById('replay-progress-percent').textContent = `${progress < 10 ? progress.toFixed(1) : Math.round(progress)}%`;
    timeline.value = state.time;
  }

  function render(force = false) {
    if (!replay) return;
    const state = engine.stateAt(replay, currentTime);
    const visibleState = {
      ...state,
      drivers: state.drivers.filter(driver => visibleDriverIds.has(driver.id))
    };
    drawReplay(visibleState);
    updateHud(state);
    updateLeaderboard(visibleState, force);
  }

  function setPlaying(value) {
    playing = Boolean(value) && Boolean(replay);
    playButton.classList.toggle('active', playing);
    pauseButton.classList.toggle('active', !playing);
    playButton.setAttribute('aria-pressed', String(playing));
    pauseButton.setAttribute('aria-pressed', String(!playing));
    stagePlay.hidden = playing;
    stagePlay.textContent = '▶';
    stagePlay.classList.toggle('paused', !playing);
    stagePlay.setAttribute('aria-label', 'Resume race simulation');
    if (playing && currentTime >= replay.duration) currentTime = 0;
    lastFrameTime = performance.now();
  }

  function frame(timestamp) {
    if (playing && replay) {
      const elapsed = Math.min(0.1, (timestamp - lastFrameTime) / 1000);
      currentTime = Math.min(replay.duration, currentTime + elapsed * Number(speedSelect.value));
      if (currentTime >= replay.duration) setPlaying(false);
      render();
    }
    lastFrameTime = timestamp;
    requestAnimationFrame(frame);
  }

  async function loadReplay(sample) {
    const requestSequence = ++loadSequence;
    setPlaying(false);
    replay = undefined;
    currentTime = 0;
    setReplayControlsEnabled(false);
    order.replaceChildren();
    driverPicker.hidden = true;
    driverPicker.open = false;
    driverOptions.replaceChildren();
    visibleDriverIds = new Set();
    updateDriverCount();
    const initialSize = sizeCanvas();
    context.clearRect(0, 0, initialSize.width, initialSize.height);
    document.getElementById('replay-title').textContent = 'Loading race…';
    raceSelect.disabled = true;
    try {
      const data = await fetchJson(sample.url || `/data/replays/${sample.file}`);
      if (requestSequence !== loadSequence) return;
      if (data.mode !== 'telemetry' || data.series !== 'f1' || data.track?.type !== 'coordinates') {
        throw new Error('Only Formula 1 coordinate telemetry replays are supported');
      }
      replay = data;
      currentTime = 0;
      lastLeaderboardSignature = '';
      stabilizeLeaderboard = engine.createOrderStabilizer(1);
      populateDriverOptions(replay.drivers);
      timeline.max = replay.duration;
      speedSelect.value = String(replay.defaultSpeed || 1);
      document.getElementById('replay-mode').textContent = `Round ${replay.round || sample.round} · ${replay.year}`;
      document.getElementById('replay-title').textContent = replay.officialName || replay.title;
      document.getElementById('replay-date').textContent = replay.date
        ? new Date(`${replay.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : '—';
      document.getElementById('replay-location').textContent = replay.location || '—';
      document.getElementById('replay-circuit').textContent = replay.circuit || '—';
      const url = new URL(window.location.href);
      url.searchParams.set('year', sample.year);
      url.searchParams.set('race', replay.id);
      history.replaceState(null, '', url);
      setReplayControlsEnabled(true);
      render(true);
    } catch (error) {
      if (requestSequence !== loadSequence) return;
      replay = undefined;
      order.replaceChildren();
      driverPicker.hidden = true;
      const { width, height } = sizeCanvas();
      context.clearRect(0, 0, width, height);
      document.getElementById('replay-title').textContent = 'Replay unavailable';
      document.getElementById('replay-circuit').textContent = error.message;
    } finally {
      if (requestSequence === loadSequence) raceSelect.disabled = false;
    }
  }

  function populateRaces(selectedId) {
    const year = Number(yearSelect.value);
    const races = catalogue.filter(sample => Number(sample.year) === year);
    raceSelect.replaceChildren(...races.map(sample => {
      const option = document.createElement('option');
      option.value = sample.id;
      option.textContent = sample.session && !['R', 'Race'].includes(sample.session) ? `${sample.title} · ${sample.session}` : sample.title;
      return option;
    }));
    raceSelect.disabled = !races.length;
    const selected = races.find(sample => sample.id === selectedId) || races[0];
    if (selected) {
      raceSelect.value = selected.id;
      loadReplay(selected);
    }
  }

  playButton.addEventListener('click', () => setPlaying(true));
  pauseButton.addEventListener('click', () => setPlaying(false));
  stagePlay.addEventListener('click', () => setPlaying(true));
  driverOptions.addEventListener('change', event => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    if (checkbox.checked) visibleDriverIds.add(checkbox.value);
    else visibleDriverIds.delete(checkbox.value);
    updateDriverCount();
    lastLeaderboardSignature = '';
    render(true);
  });
  document.getElementById('replay-drivers-all').addEventListener('click', () => setAllDriversVisible(true));
  document.getElementById('replay-drivers-none').addEventListener('click', () => setAllDriversVisible(false));
  document.addEventListener('click', event => {
    if (driverPicker.open && !driverPicker.contains(event.target)) driverPicker.open = false;
  });
  document.getElementById('replay-forward').addEventListener('click', () => {
    if (!replay) return;
    currentTime = Math.min(replay.duration, currentTime + 10);
    render(true);
  });
  document.getElementById('replay-restart').addEventListener('click', () => {
    currentTime = 0;
    setPlaying(false);
    render(true);
  });
  timeline.addEventListener('input', () => {
    currentTime = Number(timeline.value);
    render(true);
  });
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && driverPicker.open) {
      driverPicker.open = false;
      driverPicker.querySelector('summary').focus();
      return;
    }
    if (event.code !== 'Space' || /input|select|button/i.test(document.activeElement?.tagName)) return;
    event.preventDefault();
    setPlaying(!playing);
  });
  new ResizeObserver(() => render()).observe(trackPanel);

  yearSelect.addEventListener('change', () => populateRaces());
  raceSelect.addEventListener('change', () => {
    const selected = catalogue.find(sample => sample.id === raceSelect.value);
    if (selected) loadReplay(selected);
  });

  fetchJson('/data/replays/index.json').then(data => {
    catalogue = (data.samples || []).filter(sample => sample.mode === 'telemetry' && sample.series === 'f1' && Number(sample.year) >= 2018);
    if (!catalogue.length) throw new Error('No Formula 1 races have been imported yet');
    const requested = new URLSearchParams(window.location.search);
    const requestedRace = requested.get('race');
    const requestedSample = catalogue.find(sample => sample.id === requestedRace);
    const years = [...new Set(catalogue.map(sample => Number(sample.year)))].sort((a, b) => b - a);
    yearSelect.replaceChildren(...years.map(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      return option;
    }));
    const requestedYear = Number(requested.get('year'));
    yearSelect.value = String(requestedSample?.year || (years.includes(requestedYear) ? requestedYear : years[0]));
    populateRaces(requestedSample?.id);
  }).catch(error => {
    yearSelect.innerHTML = '<option value="">Unavailable</option>';
    raceSelect.innerHTML = '<option value="">No races available</option>';
    document.getElementById('replay-title').textContent = 'Race simulation unavailable';
    document.getElementById('replay-circuit').textContent = error.message;
  });
  setReplayControlsEnabled(false);
  requestAnimationFrame(frame);
})();
