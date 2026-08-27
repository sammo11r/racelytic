(function replayEngineModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RacelyticReplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createReplayEngine() {
  const startMetadataCache = new WeakMap();

  function segmentIndex(values, time) {
    if (!values?.length) return -1;
    let low = 0;
    let high = values.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (values[middle][0] <= time) low = middle + 1;
      else high = middle;
    }
    return Math.max(0, low - 1);
  }

  function latestValue(events, time, valueIndex = 1, fallback = null) {
    const index = segmentIndex(events, time);
    return index < 0 ? fallback : events[index][valueIndex];
  }

  function interpolate(values, time, indexes) {
    const index = segmentIndex(values, time);
    if (index < 0) return null;
    const current = values[index];
    const next = values[Math.min(index + 1, values.length - 1)];
    const span = next[0] - current[0];
    const ratio = span > 0 ? Math.max(0, Math.min(1, (time - current[0]) / span)) : 0;
    return Object.fromEntries(Object.entries(indexes).map(([name, valueIndex]) => [
      name, current[valueIndex] + (next[valueIndex] - current[valueIndex]) * ratio
    ]));
  }

  function isClassifiedStatus(status) {
    return /^(finished|\+\d+\s+laps?)$/i.test(String(status || '').trim());
  }

  function validPosition(value, fallback = 99) {
    const position = Number(value);
    return Number.isFinite(position) && position > 0 ? position : fallback;
  }

  function hasMeaningfulMovement(samples) {
    if (!samples?.length) return false;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const sample of samples) {
      minX = Math.min(minX, Number(sample[1]));
      maxX = Math.max(maxX, Number(sample[1]));
      minY = Math.min(minY, Number(sample[2]));
      maxY = Math.max(maxY, Number(sample[2]));
    }
    return maxX - minX > .001 || maxY - minY > .001;
  }

  function leadingCoordinateAnomaly(samples) {
    if (!samples?.length) return null;
    const firstTime = Number(samples[0][0]) || 0;
    if (firstTime >= 5) return { resumeIndex: 0, resumeTime: firstTime };
    let index = 1;
    while (index < samples.length && Math.hypot(
      Number(samples[index][1]) - Number(samples[0][1]),
      Number(samples[index][2]) - Number(samples[0][2])
    ) <= .0001) index += 1;
    if (index >= samples.length) return null;
    const stationaryTime = Number(samples[index][0]) - firstTime;
    const jump = Math.hypot(
      Number(samples[index][1]) - Number(samples[index - 1][1]),
      Number(samples[index][2]) - Number(samples[index - 1][2])
    );
    return stationaryTime >= 5 && jump > .02
      ? { resumeIndex: index, resumeTime: Number(samples[index][0]) }
      : null;
  }

  function startMetadata(data) {
    const cached = startMetadataCache.get(data);
    if (cached) return cached;
    const nonStarters = new Map(data.drivers.map(driver => [
      driver.id,
      !isClassifiedStatus(driver.status) && !hasMeaningfulMovement(data.samples?.[driver.id])
    ]));
    const coordinateAnomalies = new Map(data.drivers.map(driver => [
      driver.id,
      leadingCoordinateAnomaly(data.samples?.[driver.id])
    ]));
    const gridDrivers = data.drivers.filter(driver => !nonStarters.get(driver.id))
      .sort((a, b) => validPosition(a.grid) - validPosition(b.grid));
    const trace = data.track?.trace;
    const pole = data.samples?.[gridDrivers[0]?.id]?.[0];
    const hasTraceDirection = trace?.length >= 2 && pole;
    const dx = hasTraceDirection ? Number(trace[1][0]) - Number(trace[0][0]) : 0;
    const dy = hasTraceDirection ? Number(trace[1][1]) - Number(trace[0][1]) : 0;
    const directionLength = Math.hypot(dx, dy) || 1;
    const pitLaneStarters = new Map(data.drivers.map(driver => {
      if (typeof driver.pitLaneStart === 'boolean') return [driver.id, driver.pitLaneStart];
      if (nonStarters.get(driver.id) || !hasTraceDirection || driver.id === gridDrivers[0]?.id) return [driver.id, false];
      const sample = data.samples?.[driver.id]?.[0];
      if (!sample) return [driver.id, false];
      const forwardDistance = ((Number(sample[1]) - Number(pole[1])) * dx
        + (Number(sample[2]) - Number(pole[2])) * dy) / directionLength;
      return [driver.id, forwardDistance > .005];
    }));
    const ordered = [...data.drivers].sort((a, b) => {
      const aDns = nonStarters.get(a.id);
      const bDns = nonStarters.get(b.id);
      if (aDns !== bDns) return aDns ? 1 : -1;
      const aPit = pitLaneStarters.get(a.id);
      const bPit = pitLaneStarters.get(b.id);
      if (aPit !== bPit) return aPit ? 1 : -1;
      if (aPit && bPit) {
        const pitOrder = validPosition(a.pitLaneOrder) - validPosition(b.pitLaneOrder);
        if (pitOrder) return pitOrder;
      }
      return validPosition(a.grid) - validPosition(b.grid);
    });
    const positions = new Map(ordered.map((driver, index) => [driver.id, index + 1]));
    const metadata = {
      nonStarters,
      pitLaneStarters,
      coordinateAnomalies,
      initialProgress: new Map(),
      positions,
      needsNormalising: ordered.some(driver => nonStarters.get(driver.id) || pitLaneStarters.get(driver.id))
    };
    startMetadataCache.set(data, metadata);
    return metadata;
  }

  function isNonStarter(data, driver) {
    return startMetadata(data).nonStarters.get(driver.id);
  }

  function startingPosition(data, driver) {
    return startMetadata(data).positions.get(driver.id) || 99;
  }

  function driverStatus(data, driver, time) {
    const duration = Number(data.duration) || 0;
    const statusEvents = data.statusEvents?.[driver.id];
    if (statusEvents?.length) return String(latestValue(statusEvents, time, 1, 'RUNNING'));
    if (isNonStarter(data, driver)) return 'DNS';
    if (time >= duration) return isClassifiedStatus(driver.status) ? 'FINISHED' : 'OUT';
    if (isClassifiedStatus(driver.status)) return 'RUNNING';
    const lapEvents = data.lapEvents?.[driver.id] || [];
    const inferredRetirementTime = Number(lapEvents.at(-1)?.[0]) || 0;
    return inferredRetirementTime > 0 && time >= inferredRetirementTime ? 'OUT' : 'RUNNING';
  }

  function blendIntoResumedTelemetry(data, driver, time, anomaly, estimated) {
    let { x, y } = estimated;
    const transitionStart = Math.max(0, anomaly.resumeTime - 3);
    if (time >= transitionStart) {
      const resumeSample = data.samples?.[driver.id]?.[anomaly.resumeIndex];
      if (resumeSample) {
        const transitionRatio = Math.max(0, Math.min(1, (time - transitionStart) / Math.max(.001, anomaly.resumeTime - transitionStart)));
        x += (Number(resumeSample[1]) - x) * transitionRatio;
        y += (Number(resumeSample[2]) - y) * transitionRatio;
      }
    }
    return { x, y };
  }

  function estimatedPeerCoordinates(data, driver, time, anomaly) {
    const metadata = startMetadata(data);
    const driverPosition = metadata.positions.get(driver.id) || 99;
    const peer = data.drivers.filter(candidate => {
      if (candidate.id === driver.id || metadata.nonStarters.get(candidate.id) || metadata.pitLaneStarters.get(candidate.id)) return false;
      const candidateAnomaly = metadata.coordinateAnomalies.get(candidate.id);
      return (metadata.positions.get(candidate.id) || 99) < driverPosition
        && (!candidateAnomaly || time >= candidateAnomaly.resumeTime);
    }).sort((a, b) => (metadata.positions.get(b.id) || 0) - (metadata.positions.get(a.id) || 0))[0];
    if (!peer) return null;
    const positionGap = driverPosition - (metadata.positions.get(peer.id) || driverPosition - 1);
    const peerCoordinates = interpolate(data.samples?.[peer.id], Math.max(0, time - positionGap * .2), { x: 1, y: 2 });
    return peerCoordinates ? blendIntoResumedTelemetry(data, driver, time, anomaly, peerCoordinates) : null;
  }

  function estimatedTrackCoordinates(data, driver, time, anomaly) {
    const peerCoordinates = estimatedPeerCoordinates(data, driver, time, anomaly);
    if (peerCoordinates) return peerCoordinates;
    const trace = data.track?.trace;
    const firstLapEnd = Number(data.lapEvents?.[driver.id]?.find(event => Number(event[1]) >= 2)?.[0]);
    if (!trace?.length || trace.length < 2 || !Number.isFinite(firstLapEnd) || firstLapEnd <= 0) return null;
    const gridDelay = (startingPosition(data, driver) - 1) * .08;
    const progress = (time - gridDelay) / firstLapEnd;
    const wrappedProgress = ((progress % 1) + 1) % 1;
    const tracePosition = wrappedProgress * trace.length;
    const traceIndex = Math.floor(tracePosition) % trace.length;
    const nextTraceIndex = (traceIndex + 1) % trace.length;
    const ratio = tracePosition - Math.floor(tracePosition);
    return blendIntoResumedTelemetry(data, driver, time, anomaly, {
      x: Number(trace[traceIndex][0]) + (Number(trace[nextTraceIndex][0]) - Number(trace[traceIndex][0])) * ratio,
      y: Number(trace[traceIndex][1]) + (Number(trace[nextTraceIndex][1]) - Number(trace[traceIndex][1])) * ratio
    });
  }

  function coordinatesAt(data, driver, time) {
    const anomaly = startMetadata(data).coordinateAnomalies.get(driver.id);
    if (anomaly && time < anomaly.resumeTime) {
      const estimated = estimatedTrackCoordinates(data, driver, time, anomaly);
      if (estimated) return estimated;
    }
    return interpolate(data.samples?.[driver.id], time, { x: 1, y: 2 });
  }

  function projectedTrackProgress(trace, coordinates) {
    if (!trace?.length || trace.length < 2 || !coordinates) return null;
    let nearestProgress = null;
    let nearestDistance = Infinity;
    for (let index = 0; index < trace.length; index += 1) {
      const point = trace[index];
      const next = trace[(index + 1) % trace.length];
      const segmentX = Number(next[0]) - Number(point[0]);
      const segmentY = Number(next[1]) - Number(point[1]);
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
      const projection = segmentLengthSquared
        ? Math.max(0, Math.min(1, (
          (coordinates.x - Number(point[0])) * segmentX
          + (coordinates.y - Number(point[1])) * segmentY
        ) / segmentLengthSquared))
        : 0;
      const differenceX = Number(point[0]) + segmentX * projection - coordinates.x;
      const differenceY = Number(point[1]) + segmentY * projection - coordinates.y;
      const distance = differenceX * differenceX + differenceY * differenceY;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestProgress = (index + projection) / trace.length;
      }
    }
    return nearestProgress;
  }

  function raceProgress(data, driver, time, lap, coordinates) {
    const metadata = startMetadata(data);
    if (metadata.nonStarters.get(driver.id) || (metadata.pitLaneStarters.get(driver.id) && lap < 2)) return null;
    const currentProgress = projectedTrackProgress(data.track?.trace, coordinates);
    if (currentProgress === null) return null;
    const lapEvents = data.lapEvents?.[driver.id];
    const lapEventIndex = segmentIndex(lapEvents, time);
    const lapStart = lapEvents?.[lapEventIndex];
    const nextLapStart = lapEvents?.[lapEventIndex + 1];
    if (lapStart && nextLapStart && nextLapStart[0] > lapStart[0]) {
      const timedProgress = lap - 1 + Math.max(0, Math.min(1,
        (time - lapStart[0]) / (nextLapStart[0] - lapStart[0])
      ));
      const baseProgress = lap - 1 + currentProgress;
      const candidates = [baseProgress - 1, baseProgress, baseProgress + 1]
        .filter(candidate => candidate >= lap - 1.1 && candidate <= lap + .1);
      return candidates.reduce((closest, candidate) => (
        Math.abs(candidate - timedProgress) < Math.abs(closest - timedProgress) ? candidate : closest
      ));
    }
    let initialProgress = metadata.initialProgress.get(driver.id);
    if (initialProgress === undefined) {
      initialProgress = projectedTrackProgress(data.track?.trace, coordinatesAt(data, driver, 0));
      metadata.initialProgress.set(driver.id, initialProgress);
    }
    if (!Number.isFinite(initialProgress)) return null;
    if (lap >= 2) return lap - 1 + currentProgress;
    const unwrappedInitial = initialProgress > .5 ? initialProgress - 1 : initialProgress;
    let movement = currentProgress - initialProgress;
    if (movement < -.5) movement += 1;
    return unwrappedInitial + movement;
  }

  function telemetryState(data, driver, time) {
    const coordinates = coordinatesAt(data, driver, time);
    if (!coordinates) return null;
    const duration = Number(data.duration) || 0;
    const atFinish = time >= duration;
    const positionEvents = data.positionEvents?.[driver.id];
    const positionEventIndex = segmentIndex(positionEvents, time);
    const recordedPosition = Number(latestValue(positionEvents, time, 1, 99));
    const startNeedsNormalising = recordedPosition <= 0 || startMetadata(data).needsNormalising;
    const position = atFinish
      ? validPosition(driver.finalPosition, validPosition(recordedPosition))
      : positionEventIndex <= 0 && startNeedsNormalising
        ? startingPosition(data, driver)
        : validPosition(recordedPosition, startingPosition(data, driver));
    const lap = Number(latestValue(data.lapEvents?.[driver.id], time, 1, 1));
    return {
      ...driver,
      ...coordinates,
      progress: raceProgress(data, driver, time, lap, coordinates),
      position,
      lap,
      statusText: driverStatus(data, driver, time),
      estimated: true
    };
  }

  function stateAt(data, time) {
    const safeTime = Math.max(0, Math.min(Number(data.duration) || 0, Number(time) || 0));
    const drivers = data.drivers.map(driver => telemetryState(data, driver, safeTime)).filter(Boolean).sort((a, b) => {
      const aIsOut = ['OUT', 'DNS'].includes(a.statusText);
      const bIsOut = ['OUT', 'DNS'].includes(b.statusText);
      if (aIsOut !== bIsOut) return aIsOut ? 1 : -1;
      const aHasProgress = Number.isFinite(a.progress);
      const bHasProgress = Number.isFinite(b.progress);
      if (aHasProgress !== bHasProgress) return aHasProgress ? -1 : 1;
      const progressDifference = b.progress - a.progress;
      if (aHasProgress && Math.abs(progressDifference) > .0001) return progressDifference;
      if (a.position !== b.position) return a.position - b.position;
      return Number(a.grid || 99) - Number(b.grid || 99);
    });
    return {
      time: safeTime,
      drivers,
      lap: drivers.length ? Math.max(1, ...drivers.map(driver => driver.lap)) : 1,
      totalLaps: Number(data.totalLaps) || 0
    };
  }

  function createOrderStabilizer(holdSeconds = 1) {
    const holdDuration = Math.max(0, Number(holdSeconds) || 0);
    let displayedIds = [];
    let pendingPairs = new Map();
    let metadataSignature = '';
    let lastTime = -Infinity;

    function reset(drivers, time) {
      displayedIds = drivers.map(driver => driver.id);
      pendingPairs = new Map();
      metadataSignature = drivers
        .map(driver => `${driver.id}:${driver.statusText}:${driver.lap}`)
        .sort()
        .join('|');
      lastTime = time;
      return drivers;
    }

    return function stabilizeOrder(drivers, time, immediate = false) {
      const safeTime = Number(time) || 0;
      const driverById = new Map(drivers.map(driver => [driver.id, driver]));
      const currentMetadata = drivers
        .map(driver => `${driver.id}:${driver.statusText}:${driver.lap}`)
        .sort()
        .join('|');
      const sameDrivers = displayedIds.length === drivers.length
        && displayedIds.every(id => driverById.has(id));
      if (immediate || !sameDrivers || currentMetadata !== metadataSignature || safeTime < lastTime) {
        return reset(drivers, safeTime);
      }

      const rawIndex = new Map(drivers.map((driver, index) => [driver.id, index]));
      const activePairs = new Set();
      for (let first = 0; first < displayedIds.length; first += 1) {
        for (let second = first + 1; second < displayedIds.length; second += 1) {
          const ahead = displayedIds[first];
          const behind = displayedIds[second];
          if (rawIndex.get(ahead) < rawIndex.get(behind)) continue;
          const pair = `${behind}>${ahead}`;
          activePairs.add(pair);
          if (!pendingPairs.has(pair)) pendingPairs.set(pair, safeTime);
        }
      }
      for (const pair of pendingPairs.keys()) {
        if (!activePairs.has(pair)) pendingPairs.delete(pair);
      }

      let swapped;
      do {
        swapped = false;
        for (let index = 0; index < displayedIds.length - 1; index += 1) {
          const ahead = displayedIds[index];
          const behind = displayedIds[index + 1];
          const pendingSince = pendingPairs.get(`${behind}>${ahead}`);
          if (rawIndex.get(ahead) > rawIndex.get(behind)
            && pendingSince !== undefined
            && safeTime - pendingSince >= holdDuration) {
            displayedIds[index] = behind;
            displayedIds[index + 1] = ahead;
            swapped = true;
          }
        }
      } while (swapped);

      lastTime = safeTime;
      return displayedIds.map(id => driverById.get(id));
    };
  }

  function formatTime(totalSeconds) {
    const value = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor(value % 3600 / 60);
    const seconds = Math.floor(value % 60);
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  return { createOrderStabilizer, formatTime, isClassifiedStatus, latestValue, segmentIndex, stateAt };
});
