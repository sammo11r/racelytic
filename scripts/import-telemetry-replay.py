#!/usr/bin/env python3
"""Import a complete modern F1 replay from FastF1 position data."""

import argparse
import csv
import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "frontend" / "data" / "replays"


def event_metadata(year, round_number):
    with (ROOT / "data" / "f1db-races.csv").open(encoding="utf-8", newline="") as source:
        race = next((row for row in csv.DictReader(source) if int(row["year"]) == year and int(row["round"]) == round_number), None)
    if not race:
        return {}
    with (ROOT / "data" / "f1db-circuits.csv").open(encoding="utf-8", newline="") as source:
        circuit = next((row for row in csv.DictReader(source) if row["id"] == race["circuitId"]), {})
    return {
        "officialName": race["officialName"],
        "date": race["date"],
        "location": circuit.get("placeName") or str(race["circuitId"]).replace("-", " ").title(),
        "circuit": circuit.get("fullName") or race["circuitId"],
    }


def number(value, fallback=None):
    try:
        result = float(value)
        return fallback if math.isnan(result) else result
    except (TypeError, ValueError):
        return fallback


def seconds(value):
    return value.total_seconds() if hasattr(value, "total_seconds") else number(value)


def rounded(value, digits=3):
    return round(float(value), digits)


def is_classified_status(status):
    return bool(re.fullmatch(r"(?:finished|\+\d+\s+laps?)", str(status or "").strip(), re.IGNORECASE))


def has_meaningful_movement(rows):
    if not rows:
        return False
    x_values = [row[1] for row in rows]
    y_values = [row[2] for row in rows]
    return max(x_values) - min(x_values) > .001 or max(y_values) - min(y_values) > .001


def rotate_coordinates(streams, degrees):
    """Rotate FastF1 coordinates into the official circuit-map orientation."""
    angle = math.radians(degrees)
    cos_angle, sin_angle = math.cos(angle), math.sin(angle)
    return {
        driver: [[row[0], row[1] * cos_angle - row[2] * sin_angle, row[1] * sin_angle + row[2] * cos_angle] for row in rows]
        for driver, rows in streams.items()
    }


def normalise_coordinates(streams):
    points = [(row[1], row[2]) for rows in streams.values() for row in rows]
    min_x, max_x = min(x for x, _ in points), max(x for x, _ in points)
    min_y, max_y = min(y for _, y in points), max(y for _, y in points)
    extent = max(max_x - min_x, max_y - min_y, 1)
    centre_x, centre_y = (min_x + max_x) / 2, (min_y + max_y) / 2
    return {
        driver: [[row[0], rounded((row[1] - centre_x) / extent + .5, 4), rounded((row[2] - centre_y) / extent + .5, 4)] for row in rows]
        for driver, rows in streams.items()
    }


def catalogue_write(replay, year, round_number, session_name, output):
    output.mkdir(parents=True, exist_ok=True)
    replay_file = output / f"{replay['id']}.json"
    replay_file.write_text(json.dumps(replay, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    index_file = output / "index.json"
    catalogue = json.loads(index_file.read_text(encoding="utf-8")) if index_file.exists() else {"schemaVersion": 1, "localImports": True, "samples": []}
    entry = {"id": replay["id"], "file": replay_file.name, "url": f"/data/replays/{replay_file.name}", "mode": "telemetry", "series": "f1", "title": replay["title"], "subtitle": replay["subtitle"], "year": year, "round": round_number, "session": session_name, "local": True}
    catalogue["samples"] = [item for item in catalogue.get("samples", []) if item["id"] != replay["id"]] + [entry]
    catalogue["samples"].sort(key=lambda item: (-int(item.get("year", 0)), int(item.get("round", 0)), item.get("title", "")))
    index_file.write_text(json.dumps(catalogue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return replay_file


def import_session(args):
    try:
        import fastf1
    except ImportError as error:
        raise RuntimeError("FastF1 is not installed. Run: python -m pip install -r requirements-replay.txt") from error

    cache = Path(args.cache).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(cache))
    session = fastf1.get_session(args.year, args.round, args.session)
    session.load(telemetry=True, laps=True, weather=False, messages=False)
    laps = session.laps
    valid_starts = laps["LapStartTime"].dropna()
    if valid_starts.empty:
        raise RuntimeError("FastF1 returned no lap start times for this session")
    start = valid_starts.min()
    end = laps["Time"].dropna().max()
    duration = seconds(end - start)
    if not duration or duration <= 0:
        raise RuntimeError("Could not determine the session duration")

    raw_streams = {}
    sample_step = max(100, args.sample_ms) / 1000
    for driver_number, frame in session.pos_data.items():
        if frame is None or frame.empty or "X" not in frame or "Y" not in frame:
            continue
        time_column = "SessionTime" if "SessionTime" in frame else "Time"
        rows, last_bucket = [], None
        for _, row in frame.dropna(subset=[time_column, "X", "Y"]).iterrows():
            elapsed = seconds(row[time_column] - start)
            if elapsed is None or elapsed < 0 or elapsed > duration:
                continue
            z_value = number(row.get("Z"), 0)
            if float(row["X"]) == 0 and float(row["Y"]) == 0 and z_value == 0:
                continue
            bucket = round(elapsed / sample_step)
            if bucket == last_bucket:
                rows[-1] = [rounded(bucket * sample_step, 3), float(row["X"]), float(row["Y"])]
            else:
                rows.append([rounded(bucket * sample_step, 3), float(row["X"]), float(row["Y"])])
                last_bucket = bucket
        if len(rows) > 1:
            raw_streams[str(driver_number)] = rows
    if not raw_streams:
        raise RuntimeError("FastF1 returned no usable driver position streams")
    circuit_info = session.get_circuit_info()
    circuit_rotation = number(getattr(circuit_info, "rotation", 0), 0)
    samples = normalise_coordinates(rotate_coordinates(raw_streams, circuit_rotation))

    results_by_number = {str(row["DriverNumber"]): row for _, row in session.results.iterrows()}
    total_laps = int(number(laps["LapNumber"].max(), 1))
    start_metadata = {}
    for driver_number in samples:
        result = results_by_number.get(driver_number)
        if result is None:
            continue
        driver_laps = laps[laps["DriverNumber"].astype(str) == driver_number]
        first_lap_number = driver_laps["LapNumber"].dropna().min() if "LapNumber" in driver_laps else None
        first_lap = driver_laps[driver_laps["LapNumber"] == first_lap_number] if first_lap_number is not None else driver_laps.iloc[0:0]
        pit_out_values = first_lap["PitOutTime"].dropna() if "PitOutTime" in first_lap else []
        pit_out_elapsed = seconds(pit_out_values.iloc[0] - start) if len(pit_out_values) else None
        result_status = str(result.get("Status") or "")
        start_metadata[driver_number] = {
            "grid": int(number(result.get("GridPosition"), 0)),
            "dns": not is_classified_status(result_status) and not has_meaningful_movement(samples.get(driver_number)),
            "pitLaneStart": len(pit_out_values) > 0,
            "pitOutElapsed": number(pit_out_elapsed, math.inf),
        }
    grid_starters = sorted((key for key, value in start_metadata.items() if not value["dns"] and not value["pitLaneStart"]), key=lambda key: start_metadata[key]["grid"] or 99)
    pit_lane_starters = sorted((key for key, value in start_metadata.items() if not value["dns"] and value["pitLaneStart"]), key=lambda key: (start_metadata[key]["pitOutElapsed"], start_metadata[key]["grid"] or 99))
    non_starters = sorted((key for key, value in start_metadata.items() if value["dns"]), key=lambda key: start_metadata[key]["grid"] or 99)
    starting_positions = {driver_number: index + 1 for index, driver_number in enumerate(grid_starters + pit_lane_starters + non_starters)}
    pit_lane_order = {driver_number: index + 1 for index, driver_number in enumerate(pit_lane_starters)}
    drivers, position_events, lap_events, status_events = [], {}, {}, {}
    for driver_number in samples:
        result = results_by_number.get(driver_number)
        if result is None:
            continue
        driver_laps = laps[laps["DriverNumber"].astype(str) == driver_number]
        recorded_grid = start_metadata[driver_number]["grid"]
        grid = recorded_grid if recorded_grid > 0 else starting_positions[driver_number]
        positions = [[0, starting_positions[driver_number]]]
        lap_marks = [[0, 1]]
        for _, lap in driver_laps.dropna(subset=["Time", "LapNumber"]).iterrows():
            elapsed = seconds(lap["Time"] - start)
            if elapsed is None or elapsed < 0:
                continue
            position = int(number(lap.get("Position"), positions[-1][1]))
            positions.append([rounded(elapsed, 3), position])
            lap_marks.append([rounded(elapsed, 3), min(total_laps, int(number(lap["LapNumber"], 1)) + 1)])
        position_events[driver_number] = positions
        lap_events[driver_number] = lap_marks
        result_status = str(result.get("Status") or "")
        if is_classified_status(result_status):
            terminal_time, terminal_status = duration, "FINISHED"
        elif not has_meaningful_movement(samples.get(driver_number)):
            terminal_time, terminal_status = 0, "DNS"
        else:
            timed_laps = driver_laps["Time"].dropna() if "Time" in driver_laps else []
            retirement_elapsed = seconds(timed_laps.max() - start) if len(timed_laps) else 0
            terminal_time = max(0, min(duration, number(retirement_elapsed, duration)))
            terminal_status = "OUT"
        status_events[driver_number] = [[0, "RUNNING"], [rounded(terminal_time), terminal_status]]
        colour = str(result.get("TeamColor") or "888888").lstrip("#")
        drivers.append({"id": driver_number, "code": str(result.get("Abbreviation") or driver_number), "name": str(result.get("FullName") or result.get("BroadcastName") or driver_number), "team": str(result.get("TeamName") or ""), "colour": f"#{colour}", "grid": grid, "pitLaneStart": start_metadata[driver_number]["pitLaneStart"], "pitLaneOrder": pit_lane_order.get(driver_number), "finalPosition": int(number(result.get("Position"), 99)), "status": result_status})
    active = {driver["id"] for driver in drivers}
    samples = {key: value for key, value in samples.items() if key in active}
    fastest_lap = laps.pick_fastest()
    trace_driver = str(fastest_lap["DriverNumber"]) if fastest_lap is not None else max(samples, key=lambda key: len(samples[key]))
    trace_start = seconds(fastest_lap["LapStartTime"] - start) if fastest_lap is not None else 0
    trace_end = seconds(fastest_lap["Time"] - start) if fastest_lap is not None else duration
    trace_samples = [row for row in samples.get(trace_driver, []) if trace_start <= row[0] <= trace_end]
    if len(trace_samples) < 20:
        trace_samples = samples[max(samples, key=lambda key: len(samples[key]))]
    trace = [row[1:] for row in trace_samples[::max(1, len(trace_samples) // 240)]]
    session_name = str(session.event.get("EventName") or f"{args.year} round {args.round}")
    metadata = event_metadata(args.year, args.round)
    replay_id = f"f1-{args.year}-{args.round:02d}-{str(args.session).lower()}-telemetry"
    return {"schemaVersion": 1, "id": replay_id, "mode": "telemetry", "series": "f1", "year": args.year, "round": args.round, "totalLaps": total_laps, "title": session_name, "officialName": metadata.get("officialName", session_name), "date": metadata.get("date", ""), "location": metadata.get("location", str(session.event.get("Location") or "")), "subtitle": f"Complete {session.name} coordinate replay", "circuit": metadata.get("circuit", str(session.event.get("Location") or session_name)), "duration": rounded(duration), "defaultSpeed": 1, "quality": {"label": "Telemetry replay", "description": "Driver markers use timestamped FastF1 position coordinates. Running order is updated at each recorded lap timing point.", "positionSource": "FastF1 position and lap timing data", "estimatedBetweenSamples": True}, "attribution": {"label": "FastF1 timing data", "url": "https://docs.fastf1.dev/"}, "track": {"type": "coordinates", "trace": trace, "orientation": "official-map", "rotationDegrees": circuit_rotation}, "drivers": drivers, "samples": samples, "positionEvents": position_events, "lapEvents": lap_events, "statusEvents": status_events}


def main():
    parser = argparse.ArgumentParser(description="Import a modern F1 coordinate replay using FastF1")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--round", type=int, required=True)
    parser.add_argument("--session", default="R", help="FastF1 session identifier (default: R)")
    parser.add_argument("--sample-ms", type=int, default=500, help="Coordinate sampling interval (default: 500)")
    parser.add_argument("--cache", default=str(ROOT / "data" / ".replay-cache" / "fastf1"))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()
    if args.year < 2018:
        parser.error("only Formula 1 seasons from 2018 onward are supported")
    replay = import_session(args)
    catalogue_session = "Race" if str(args.session).upper() == "R" else str(args.session)
    replay_file = catalogue_write(replay, args.year, args.round, catalogue_session, Path(args.output).resolve())
    count = sum(len(rows) for rows in replay["samples"].values())
    if Path(args.output).resolve() == DEFAULT_OUTPUT.resolve():
        subprocess.run(
            ["node", str(ROOT / "scripts" / "compact-replays.js"), "--id", replay["id"]],
            cwd=ROOT,
            check=True,
        )
    print(f"Imported {replay['title']}: {len(replay['drivers'])} drivers, {count} coordinate samples.")
    print(f"Saved {replay_file}")
    print(f"Preview at /simulate-race?year={args.year}&race={replay['id']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
