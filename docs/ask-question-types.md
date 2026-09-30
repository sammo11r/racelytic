# Ask Racelytic question types

This is the working inventory of **answer types**, not a list of ways to phrase them. One type has one calculation and evidence contract; changing a name, season, class, circuit, or wording does not create a new type. The list is intended to cover historical, archive-backed questions across F1, F2, F3, F1 Academy, Formula E, and WEC. It cannot be literally exhaustive of every possible question. Add a type when a real question needs a materially different calculation or evidence contract.

Status: **Existing** = an Ask intent or WEC tool exists, though coverage and filters differ by championship. **Calculate** = a new Ask calculation is needed; data availability must be checked before implementation. **Data** = needs new stored data or provenance. **Define** = needs a clear metric or policy before it can be answered. Existing does not guarantee every phrasing is recognized. No new external data provider is approved, so Data questions must request a source instead of guessing. Subjective rankings and predictions remain clarification questions until a metric or method is agreed.

The concrete question inventory is at the end of this document. For alternative
phrasing and follow-up edits by type ID, see
[Ask wording variations](ask-question-variations.md).

Every answer should expose the resolved championship, entity, filters, cutoff, calculation, source rows, and assumptions. WEC questions need an explicit or inferred class where classes cannot be compared fairly. A requested filter that the calculation cannot apply must produce a clarification or refusal.

## 1. Calendar, events, and circuits

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| CAL-01 | What was the first race of a season, and where/when was it held? | Existing | First recorded classified event; circuit, place, date, round. |
| CAL-02 | What was the last race of a season, and where/when was it held? | Existing | Last classified event; scheduled but unrun events are excluded. |
| CAL-03 | What was the next/previous event relative to a named event? | Existing | Ordered completed calendar with an exact season and unambiguous event anchor. |
| CAL-04 | Which races were held in a season, and in what order? | Existing | Completed event calendar in round order; each listed event links to its archive page. |
| CAL-05 | How many races or events were held in a season? | Existing | Count completed events or recorded race sessions; sprints are included in race counts. |
| CAL-06 | Which years did a circuit, event, or country host this championship? | Partial | Circuit and event years are supported across series; country years are supported where the circuit has country metadata (F1, Formula E, WEC). |
| CAL-07 | When did an event or circuit first/last appear on the calendar? | Existing | Earliest/latest recorded classified occurrence. |
| CAL-08 | Which circuit or event hosted the most races? | Existing | Grouped recorded race-session count; event renames are not merged. |
| CAL-09 | Where is a circuit and what is its archive history? | Existing | Circuit profile and linked events. |
| CAL-10 | Which events were cancelled, postponed, or replaced, and why? | Data | Calendar change history and sourced reasons. |
| CAL-11 | When and where is the next scheduled event? | Data | Current official schedule, time zone and schedule update timestamp. |

## 2. Race and session results

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| RES-01 | Who won a specified race? | Existing | Official classification, event, date, class/session. |
| RES-02 | Who finished on a specified race podium? | Existing | Classified P1–P3 in the requested scope. |
| RES-03 | What was the full classification of a race? | Existing | Ordered classified and unclassified entries with status. |
| RES-04 | Where did a named driver or team finish in a race? | Existing | Resolved competitor and result row. |
| RES-05 | Who started in a specified grid position? | Partial | F1 official starting grid after penalties; other series need session-specific grid support. |
| RES-06 | Who took pole at a race weekend? | Partial | F1 recorded official pole attribution; other series need session-specific pole support. |
| RES-07 | What happened in a sprint, feature race, or qualifying session? | Partial | F1 Grand Prix, sprint and qualifying classifications; junior feature and WEC class sessions remain. |
| RES-08 | How many points did a competitor score at an event? | Partial | F1 recorded Grand Prix and sprint points for a driver or team; external standings adjustments remain outside this calculation. |
| RES-09 | Which competitors retired, failed to start, or were disqualified? | Partial | F1 recorded race or sprint status; other series remain. |
| RES-10 | What was the finishing gap or winning margin in a race? | Data | Reliable lap/time gaps and treatment of lapped finishers. |
| RES-11 | Who gained or lost the most positions in a race? | Partial | F1 grid versus classified Grand Prix finish; other series remain. |
| RES-12 | Which car or crew won a WEC class or the overall race? | Existing | Entry, class/overall position, team, full crew. |
| RES-13 | Who entered or started a specified race? | Partial | F1 result-table entrants versus starters; WEC cars and crews remain. |
| RES-14 | What were the points awarded to every competitor at an event? | Partial | F1 race plus sprint points by driver or team; external standings adjustments remain. |
| RES-15 | Why did a competitor retire? | Data | Sourced incident/cause record; result status alone is insufficient. |
| RES-16 | Who led the most laps? | Data | Lap-leader feed with session scope. |
| RES-17 | Who set the fastest race lap? | Partial | F1 recorded fastest race lap and time; bonus-point eligibility is separate. |
| RES-18 | Why was a competitor penalized? | Data | Sourced steward decision and amended classification. |
| RES-19 | Who made the fastest pit stop? | Data | Pit-stop timing feed, car and session scope. |
| RES-20 | Who qualified in a specified position? | Partial | F1 recorded qualifying classification before grid penalties. |

## 3. Standings and championships

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| STD-01 | What were the final driver, team, or manufacturer standings? | Existing | Official final standings with season and class. |
| STD-02 | What were the standings after a specified round? | Existing | Exact recorded round cutoff; no later points. |
| STD-03 | Who led the championship after a specified round? | Existing | P1 in the exact cutoff table. |
| STD-04 | Who won a specified championship or class? | Existing | Official title/standings winner. |
| STD-05 | What was the gap between Pₓ and Pᵧ in one season's final standings? | Existing | Both official points totals and subtraction for an explicitly selected completed season; x < y. |
| STD-06 | Which season had the largest/smallest final Pₓ–Pᵧ gap? | Existing | Compare completed seasons, preserve ties. |
| STD-07 | Which season had the tightest top four? | Existing | Final P1–P4 spread, with P2/P3 evidence. |
| STD-08 | How did a competitor's rank or points change between two rounds? | Partial | F1 official cumulative standings compare the named competitor at two exact round cutoffs. |
| STD-09 | When did the championship lead change, and how often? | Partial | F1 official P1 after each round identifies changes; ambiguous multiple P1 rows are refused. |
| STD-10 | When was a title mathematically clinched? | Calculate | Points remaining and tie-break rules at each cutoff. |
| STD-11 | Which competitor improved most from one season's standings to the next? | Partial | F1 and junior-series final standings compare ranks for competitors present in both consecutive completed seasons. WEC class scope remains. |
| STD-12 | Which champion had the fewest/most wins or points? | Partial | F1 and junior-series official final champions joined to recorded wins or final points; points across scoring eras are not normalized. WEC class scope remains. |
| STD-13 | How many points did a competitor gain or lose to a rival in one round? | Partial | F1 official cumulative points before and after a named round yield each competitor's gain and the swing. |

## 4. Individual careers and milestones

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| CAR-01 | Who is a named driver and what is their archive career summary? | Existing | Identity, seasons, teams, results and titles. |
| CAR-02 | When/where did a driver make their first recorded race start? | Existing | Resolved identity and earliest start, not first entry. |
| CAR-03 | When was a driver's last recorded race start? | Existing | Latest start and date. |
| CAR-04 | When did a driver first/last score points, take a podium, win, or take pole? | Partial | First and last points/podium/win use recorded chronology; F1 first and last official pole attribution is supported. Pole attribution in other series remains. |
| CAR-05 | Who waited longest from debut to first points, podium, or win? | Existing | Calendar duration and starts until milestone. |
| CAR-06 | Who reached a milestone in the fewest starts or shortest calendar time? | Existing | First milestone indexed from debut; explicit starts or calendar days. |
| CAR-07 | Who reached N wins, podiums, starts, or points first/fastest? | Existing | Cumulative race sequence and threshold; compare fewest starts or earliest recorded milestone date. |
| CAR-08 | Which drivers never scored, never reached a podium, or never won despite N starts? | Existing | Recorded race starts plus zero qualifying milestones and threshold; WEC requires a class. |
| CAR-09 | Which drivers won on debut, scored on debut, or took a debut podium? | Existing | First recorded race-start result and milestone check; WEC requires a class. |
| CAR-10 | What was a named competitor's season summary? | Existing in WEC; calculate for other Ask paths | Season starts, wins, podiums, points, final rank, class. |
| CAR-11 | What were a driver's best/worst season or race results? | Existing | Ranked classified race finishes or official final season points/rank with ties and evidence. |
| CAR-12 | How old was a driver at debut, first win, or another milestone? | Data | Verified birth dates plus milestone dates; age policy. |
| CAR-13 | How did a driver perform before/after changing teams? | Existing for one named target team stint | Immediately preceding and target stints with dated boundaries, starts, wins, podiums and recorded race points. A season disambiguates repeated stints. |
| CAR-14 | Which events did a driver enter, start, or miss in a season? | Partial | F1 completed calendar and result-table entries distinguish no entry, DNS and starts; a driver must have at least one season entry before missed races are listed. |

## 5. Teams, lineups, and relationships

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| TEAM-01 | What is a named team's archive history? | Existing outside WEC Ask | Resolved team, seasons, drivers, results, titles. |
| TEAM-02 | Which drivers raced for a team, and in which seasons? | Existing through team profile outside WEC Ask | Driver-team starts and seasons. |
| TEAM-03 | Who drove for a named team the longest? | Existing | Sum calendar time in separate recorded stints; show each stint. |
| TEAM-04 | Who spent the most distinct seasons with one team? | Existing | Distinct driver-team seasons; partial seasons count. |
| TEAM-05 | Which teammates raced together for the most events? | Existing | Same team and event; WEC means same starting car. |
| TEAM-06 | When did a team last score points, podium, or win? | Existing | Latest qualifying event/session, date and result. |
| TEAM-07 | When did a team first score points, podium, or win? | Existing | Earliest qualifying event/session. |
| TEAM-08 | What was a team's most/least successful season by a chosen metric? | Partial | F1 and junior-series team wins/podiums from classified race results or points from final official standings. WEC class scope remains. |
| TEAM-09 | Which lineup or crew scored the most wins/points together? | Existing | Stable multi-driver team lineup per race session or WEC crew per car; WEC requires a class. |
| TEAM-10 | Which team changes or teammate pairings did a driver have? | Existing | Team stints follow recorded starts; teammate pairs share a team/session, or one WEC car entry, at an event. |
| TEAM-11 | How did a team perform before/after a name or ownership change? | Define | Explicit constructor lineage and comparison boundary. |
| TEAM-12 | When did a team make its first or last recorded start? | Existing | Resolved team name and boundary event; cross-name lineage is not merged. |

## 6. Records, ranks, and distributions

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| REC-01 | Who leads an archive metric? | Existing | Ranked wins, podiums, poles, fastest laps, starts, points, titles, DNFs, grid gain or rates. |
| REC-02 | What is one competitor's total for an archive metric? | Existing | Resolved driver/team and result rows. |
| REC-03 | Who leads an archive metric at a circuit, event, or country? | Existing where filter supported | Same metric with exact venue/event scope. |
| REC-04 | Who leads an archive metric in a season or year range? | Existing where filter supported | Same metric with exact year bounds. |
| REC-05 | Who leads an archive metric for a team or nationality? | Existing where filter supported | Competitor/team/nationality scope. |
| REC-06 | Which driver scored the most season points without a win? | Existing | Official season points and zero race wins. |
| REC-07 | Who had the most wins/podiums/poles/points in one season? | Partial | F1 and junior-series completed seasons support wins, podiums and final points; recorded pole attribution is supported for F1. Scoring eras are noted. |
| REC-08 | What is a competitor's win/podium/finish rate? | Existing | Numerator, starts denominator, and sample threshold. |
| REC-09 | What is a competitor's average or median finish/grid gain? | Existing for average; calculate for median | Eligible race rows, exclusions, denominator. |
| REC-10 | What is the distribution of finishes, points, or positions? | Existing for race finishes and points | Counts by exact finishing position or recorded race points per start, with unclassified starts separated. |
| REC-11 | Which records were broken at a named event or date? | Calculate | Chronological record progression up to cutoff. |

## 7. Comparisons and head-to-heads

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| CMP-01 | Compare two drivers on an archive metric. | Existing | Both totals and identical championship, metric, year and venue scope. |
| CMP-02 | Compare two teams/manufacturers on an archive metric. | Existing | Same scope and both totals. |
| CMP-03 | Compare two drivers only in races they both started. | Existing where comparison scope supported | Shared-start event set and both results. |
| CMP-04 | Compare teammates during their shared time at one team. | Existing where comparison scope supported | Shared team/events and matched results. |
| CMP-05 | Who finished ahead more often head-to-head? | Existing where metric supported | Matched starts, classified/unclassified policy. |
| CMP-06 | Who qualified ahead more often? | Existing where session data supported | Matched qualifying sessions and exclusions. |
| CMP-07 | How did the same competitor perform in two seasons or periods? | Existing for two completed seasons | Parallel starts, wins, podiums and official final points/rank in one championship and class. Arbitrary date periods remain unsupported. |
| CMP-08 | How did two seasons, teams, or classes compare on competitiveness? | Define | Choose a measurable spread, rate, or depth metric first. |
| CMP-09 | How did teammates compare across one season? | Existing | The driver head-to-head calculation accepts one season and a teammates-only scope, with shared starts, race and qualifying comparisons. |

## 8. Streaks, runs, and chronology

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| STR-01 | Who had the longest consecutive wins, podiums, points, or finishes? | Existing | Ordered eligible event sequence and streak boundaries. |
| STR-02 | What was a named competitor's longest streak? | Existing for drivers | Same sequence restricted to one resolved driver. |
| STR-03 | When did a streak start/end, and which events made it up? | Existing for named driver streaks | Full event sequence as evidence. |
| STR-04 | Who had the longest gap between wins, podiums, points, or starts? | Existing | Two consecutive qualifying boundary starts, intervening starts and calendar days; WEC requires a class. |
| STR-05 | When did a team/driver last fail to score or finish? | Existing for recorded race starts | Latest non-scoring race or non-finish; teams qualify when every recorded starter fails the criterion. |
| STR-06 | How often did a driver/team win at consecutive appearances of one event? | Existing | Count winning pairs and runs in event-specific ordered appearances; WEC requires a class. |

## 9. Points systems and what-if calculations

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| PTS-01 | Who wins a season under a specified historical points system? | Existing for F1 rulebooks | Rescored race rows and final table. |
| PTS-02 | How many titles would a competitor have under other rules? | Existing for F1 rulebooks | Every completed season's rescore and title count. |
| PTS-03 | Who would lead career points/titles under other rules? | Existing for F1 rulebooks | Multi-season rescore and ranking. |
| PTS-04 | Which championships change winner under other rules? | Existing for F1 rulebooks | Official and recalculated winners by season. |
| PTS-05 | Compare two historical points systems for a season/competitor. | Existing for F1 rulebooks | Parallel rescored standings with rule details. |
| PTS-06 | What would standings look like if one race result changed? | Calculate | Explicit hypothetical result, displacement rules, rescore. |
| PTS-07 | What result does a contender need to win a title at a cutoff? | Calculate | Current official points, remaining events, tie-breaks. |
| PTS-08 | What is the maximum/minimum achievable finish or points total? | Calculate | Remaining calendar and scoring rules. |
| PTS-09 | How did a points-rule change alter a historical result? | Calculate | Two documented rulesets and identical results. |

## 10. WEC and endurance-specific questions

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| END-01 | Who won overall versus in a specified class? | Existing | Both classifications kept separate. |
| END-02 | Which drivers shared a car for a result, season, or most events? | Existing for most shared events; calculate for event/season lookup | Crew assignment and car entry. |
| END-03 | How did a car's class rank compare with its overall rank? | Existing | WEC class and overall ranks come from the same recorded race classification for a named car and event. |
| END-04 | Which manufacturer/team has the most class wins or titles? | Existing where entity and class filters supported | Class-scoped entries, results, championships. |
| END-05 | How many cars did a team enter in an event or season? | Existing | WEC event entries or distinct season competitors for a named team; optional class filter. |
| END-06 | Which crew or car completed the most laps/distance? | Data | Reliable classified lap/distance totals per entry. |
| END-07 | What was the result after a WEC class or regulation change? | Define | Explicit classes/eras and comparison metric. |
| END-08 | Who was fastest in wet qualifying? | Data | Qualifying timing plus sourced weather/condition attribution. |
| END-09 | Who was fastest in a named WEC session? | Data | Session timing and class/overall scope. |

## 11. Explanations, provenance, and limits

| ID | Canonical question type | Status | Calculation or evidence |
| --- | --- | --- | --- |
| EXP-01 | What does a supported motorsport term mean? | Existing | Curated glossary definition. |
| EXP-02 | How was the previous answer calculated? | Existing | Previous tool, scope, evidence and assumptions. |
| EXP-03 | Why was a competitor ranked above another on equal points? | Calculate | Applicable countback rules and event results. |
| EXP-04 | Which source rows support a displayed number? | Existing where tool grounding is present | Direct linked/identified rows and formula. |
| EXP-05 | Why is a requested result missing or incomplete? | Calculate | Coverage and missing-data diagnostics, not guessed facts. |
| EXP-06 | Who was the best/greatest driver, team, or car? | Define | User-selected objective metric and era/scope; subjective claim stays labelled. |
| EXP-07 | What will happen in a future race or championship? | Define | Separate prediction model, inputs, uncertainty and as-of date. |

## Review decisions

- Ferrari is an example of the `team` slot in TEAM-03, not a Ferrari-specific type. Separate stints remain evidence for the tenure calculation.
- P3–P4 and P1–P2 are values of the same position-pair slots in STD-05/06. The former asks for a gap in one season; the latter may ask for an extreme across seasons.
- Pole, fastest race lap, starting grid, and qualifying rank have separate IDs because their source rows and penalty rules can differ.
- Retirement cause, steward penalty, laps led, and pit-stop speed have separate IDs because a classification row cannot establish all four.
- A WEC overall result and a class result use the same result family with an explicit `scope` slot; they must never be merged into one rank.
- “Best” remains EXP-06 until the user supplies a metric. Future predictions remain EXP-07 and require a separately evaluated model.

Before promoting a proposed type to `Existing`, verify event-versus-race counting in double headers, constructor lineage, WEC class defaults, official-versus-recalculated points, and whether missing historical rows mean zero or unknown. These are calculation decisions, not phrase matching decisions.

## Shared slots to resolve before wording work

All families may need `championship`, `season` or `date range`, `event`, `circuit`, `country`, `session/race format`, `competitor`, `entity type`, `metric`, `class`, and `cutoff round`. Some need `position pair`, `milestone`, `threshold`, `comparison set`, or `points rulebook`. These are filters on a type, not separate types. For example, “P3–P4” and “P1–P2” share STD-06, while “first points” and “first win” share CAR-04.

When expanding the semantic fallback, evaluate both the selected type **and
every requested slot**. Add new phrasing and follow-up cases to the separate
variation set only after confirming the calculation and evidence contract.

## Concrete question inventory

This seed inventory combines questions already present in the repository's Ask examples and tests with questions supplied directly by the user. It is **not** a sample of production user questions: no anonymized question log is available in this workspace. Add real, consented questions to the evaluation corpus before using this inventory to prioritize more language coverage.

| Question or variant | Status | Calculation and data | Evidence required |
| --- | --- | --- | --- |
| Who drove for [team] the longest? (for example, Ferrari) | Implemented for recorded teams in the selected championship | Resolve the requested team in that championship. For F1, join `drivers`, `constructors`, `races_race_results` and `races`; use equivalent race-session results for F2, F3, F1 Academy and Formula E, and WEC crew, entry, team and event records for WEC. Find each driver's separate stints with that team, measure elapsed calendar time from first to last recorded race start in each stint, then sum the stint durations. Exclude time away from the team. Race dates approximate tenure; contract start/end dates are not recorded. | Resolved team and championship, ranked drivers, summed years/months/days, each stint's first and last race dates, and an explicit note that gaps are excluded |
| Who spent the most seasons with one team? | Implemented | In the selected championship, group recorded race starts by driver, team and season, then count distinct seasons for each driver-team pair. Count separate stints toward the same pair; count a season with at least one start once. For WEC, use recorded race-starting crew and their entry's team. | Driver, team, distinct season count, season list and race-start evidence; explain that partial seasons count |
| Which teammates raced together for the most events? | Implemented | Pair drivers who both started at least one race for the same team at the same event in the selected championship; count each event once even when it has multiple races. In WEC, define teammates as drivers sharing the same starting car/entry, not merely the same team name. | Both drivers, shared team or WEC entry, event count, first and last shared event and sample event links |
| Who took the longest from debut to first points, podium, or win? | Implemented | Select one requested milestone, find each driver's first recorded race start and first subsequent race meeting that milestone, then rank elapsed calendar days. Use each championship's recorded race results and points; in WEC, scope podiums and wins to the selected class and count crew members on the same classified entry. Exclude drivers with no recorded milestone from the ranking and report that exclusion. | Driver, milestone, debut and milestone events/dates, elapsed time, starts until milestone and championship/class scope |
| What is the largest or smallest points gap between Pₓ and Pᵧ in the final standings? (for example, P3 and P4) | Implemented; WEC requires a class | Parse two requested finishing positions with x < y; default to driver standings unless the question explicitly asks for teams or manufacturers. Use final official season standings, such as `seasons_driver_standings` or `seasons_constructor_standings` for F1 and equivalent championship tables elsewhere. For each completed season containing both positions, subtract Pᵧ points from Pₓ points, then rank the gaps. Keep WEC comparisons inside one class. | Requested positions, season, championship, standings type, both competitors and their points, calculated gap, and all tied extremes; disclose seasons excluded because either position is missing |
| What is the closest final championship margin between P1 and P2? | Implemented through the Pₓ–Pᵧ gap calculation | Set x = 1 and y = 2, find the smallest final official points gap across completed seasons in the selected championship. Default to driver standings; keep WEC comparisons within one class. | Season, champion and runner-up, both points totals, margin and tied seasons |
| Which season had the tightest top four in the final standings? | Implemented through the Pₓ–Pᵧ gap calculation | For each completed season with at least four classified standings positions, calculate P1 points minus P4 points and find the minimum. Default to driver standings; keep WEC comparisons within one class. | Season, P1 through P4 competitors and points, P1–P4 spread and tied seasons |
| When did [team] last score points, reach a podium, or win? | Implemented; points and podium/win use separate tools | Resolve the team and requested milestone in the selected championship, then find its latest recorded race result meeting that milestone. For F1 points, include Grand Prix and sprint points; for a podium or win, use the main race and clarify that an explicit sprint modifier is not supported. In WEC, use the selected class's classification. | Team, milestone, event/session, date, finishing position or points, and championship/class scope |
| Who scored the most points without winning a race in a season? | Implemented; WEC requires a class | For each driver-season in the selected championship, combine its official season points with recorded race wins; retain seasons with zero wins and rank by official points. Do not normalize points across historical scoring systems. In WEC, compare drivers within a class. | Driver, season, official points, zero recorded wins, race starts, scoring-era note and tied leaders |
| Where was the first Grand Prix of 2025 held? | Answerable | `races`, `races_race_results`, `grands_prix`, `circuits`, `countries`; first 2025 round with a recorded F1 race classification. Other championships use their equivalent event, circuit and race-result tables. | Race, circuit, location, date and round; disclose that unrun calendar entries are excluded |
| When did Schumacher make his debut? | Needs identity clarification | `drivers`, `races_race_results`, `races`; after selecting Michael or Ralf Schumacher, find that driver's earliest recorded race start. Junior championships use race session results and WEC uses crew assignments plus race results. | Resolved driver, first race and date; define debut as a race start |
| What was the last time Alpine scored points? | Answerable in a selected championship | `constructors`, `races_race_results`, `races_sprint_race_results`, `races`; find the latest F1 event session with positive Alpine points. Junior championships use race session results; WEC uses team race results. | Resolved team, race, session, date and points; keep the chosen championship explicit |
| Who has the most WEC Hypercar wins since 2020? | Answerable | `wec_session_results`, `wec_sessions`, `wec_events`, `wec_entries`, `wec_entry_drivers`, `wec_drivers`, `wec_classes`; distinct classified race events with class position 1, year ≥ 2020 | Ranked drivers, wins, starts, class and year scope |
| Most Hypercar wins at Spa in 2024? | Answerable | Same results joined to `wec_circuits`; restrict circuit ID and event year 2024 | Ranked rows, resolved circuit, class and exact season |
| Alice versus Bob for Hypercar wins in 2024 | Answerable when both names resolve uniquely | Same race aggregate for two driver IDs with identical filters | Both totals, starts and shared scope; this compares totals, not only races both entered |
| Who won the 2025 Hypercar drivers championship? | Answerable | `wec_championships`, `wec_classes`, `wec_standings`, `wec_drivers`; latest recorded round and `championshipWon` flag | Official standings rows, points, class and season |
| Hypercar driver standings after round 3 in 2025 | Answerable if round 3 is recorded | Same standings tables, exact `standings.round = 3` | Round 3 standings rows; describe leader, not final champion |
| Alice Driver Hypercar season summary in 2024 | Answerable | Race classification aggregate for one driver and year | Starts, wins, podiums, class and year |
| Who won the 2025 24 Hours of Le Mans? | Answerable | `wec_events`, `wec_circuits`, `wec_session_results`, `wec_entries`, `wec_teams`, `wec_entry_drivers` | Winning car, team, crew and event classification |
| Who was fastest in wet qualifying at Spa? | Requires new data/calculation | Session timing, weather and wet-condition attribution are not calculated by WEC Ask | Qualifying timing rows, weather evidence and session scope |
| Who was the best Hypercar driver? | Subjective | A scoring definition must be specified first | Explicit criteria and supporting calculations |

Evaluation cases live in `test/ask-wec.test.js`. Each supported family should retain variants for wording, follow-up slot edits, missing names or rounds, and modifiers the calculator cannot apply. Both returned values and SQL scope parameters are asserted where useful.
