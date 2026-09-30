# Ask Racelytic wording variations

This is a planning and evaluation set for the catalogue and concrete examples
in [Ask question types](ask-question-types.md). It is **not a claim that these
wordings work today**. Each row gives two ways to ask for the same answer type.
Brackets are slots to substitute with a real archive value. Keep every
explicit slot when turning a template into a test. Types marked `Data` or
`Define` remain unsupported until their prerequisites exist.

The fallback should output the type ID's intent family and all slots, then the calculator should either apply all filters or clarify/refuse. The variation set deliberately separates **synonyms** from **changed calculations**: “first” versus “last” is a slot change; “fastest lap” versus “fastest pit stop” changes the metric and evidence.

## Calendar, events, and circuits

| ID | Variation A | Variation B |
| --- | --- | --- |
| CAL-01 | Where did the [season] season begin? | Which circuit hosted round one in [season]? |
| CAL-02 | Where did the [season] season finish? | What was the final completed race of [season]? |
| CAL-03 | What came after [event] in [season]? | Which race preceded [event] in [season]? |
| CAL-04 | Show me the [season] race calendar in order. | List every [season] event by round. |
| CAL-05 | How many events took place in [season]? | How many races were run in [season]? |
| CAL-06 | In which seasons did [circuit] host [championship]? | What years did [event] appear on the calendar? |
| CAL-07 | When did [circuit] first host [championship]? | What was [event]'s final appearance? |
| CAL-08 | Which venue has hosted the most races? | What event has appeared most often on the calendar? |
| CAL-09 | Tell me about [circuit] as a racing venue. | What is the archive history of [circuit]? |
| CAL-10 | Which [season] races were called off? | Why was [event] moved or cancelled? |
| CAL-11 | When is the next [championship] race? | Where is the upcoming round and what time does it start? |

## Race and session results

| ID | Variation A | Variation B |
| --- | --- | --- |
| RES-01 | Who took the win at [event] in [season]? | Who finished first in the [season] [event]? |
| RES-02 | Who filled the top three at [event] in [season]? | Show the [class] podium for [event] [season]. |
| RES-03 | Give me the finishing order for [event] [season]. | Show the full [class] results from [event] [season]. |
| RES-04 | Where did [driver] place at [event] [season]? | What was [team]'s result at [event] [season]? |
| RES-05 | Who lined up P[grid position] at [event] [season]? | Who started from [grid position] at [event] [season]? |
| RES-06 | Who claimed pole for the [season] [event]? | Which driver was credited with pole at [event] [season]? |
| RES-07 | What was the sprint result at [event] [season]? | Show [event]'s [season] qualifying classification. |
| RES-08 | How many points did [driver] collect at [event] [season]? | What was [team]'s points haul at [event] [season]? |
| RES-09 | Who failed to finish [event] [season]? | Which entrants were DNS or disqualified at [event] [season]? |
| RES-10 | What was the gap from P1 to P2 at [event] [season]? | By how much did [winner] win [event] [season]? |
| RES-11 | Who gained the most places at [event] [season]? | Which driver lost the most positions from grid to flag? |
| RES-12 | Which car won [class] at [WEC event] [season]? | Who was in the overall winning crew at [WEC event] [season]? |
| RES-13 | Who started [event] in [season]? | Show the [class] entry list for [event] [season]. |
| RES-14 | Break down the points from [event] [season]. | Show every team's event points, including the sprint. |
| RES-15 | What caused [driver]'s retirement at [event] [season]? | Why was [car] listed as a DNF at [event] [season]? |
| RES-16 | Who spent the most laps in the lead at [event] [season]? | Which driver led the greatest number of laps at [event] [season]? |
| RES-17 | Who recorded the fastest lap at [event] [season]? | Which [class] driver set the quickest race lap at [event] [season]? |
| RES-18 | Why was [driver] penalized at [event]? | Which steward decision changed [car]'s result? |
| RES-19 | Which crew recorded the quickest pit stop at [event] [season]? | What was the fastest pit-stop time at [event] [season]? |
| RES-20 | Who qualified P[position] at [event] [season]? | Which driver placed [position] in qualifying? |

## Standings and championships

| ID | Variation A | Variation B |
| --- | --- | --- |
| STD-01 | Show the final [season] [drivers/teams] table. | How did the [class] championship finish in [season]? |
| STD-02 | Show [season] standings following round [round]. | What was the table immediately after [event] [season]? |
| STD-03 | Who was top of the standings after round [round]? | Who led [class] after [event] [season]? |
| STD-04 | Who took the [season] [drivers/teams] title? | Which [class] competitor was champion in [season]? |
| STD-05 | How far ahead was P[x] of P[y] in [season]? | What was the final points difference between [position x] and [position y]? |
| STD-06 | Which year had the widest P[x]–P[y] final margin? | Find the narrowest final standings gap from P[x] to P[y]. |
| STD-07 | In which season were the top four closest? | Find the smallest final P1-to-P4 spread. |
| STD-08 | How many places did [driver] climb between rounds [a] and [b]? | How did [team]'s points change from [round a] to [round b]? |
| STD-09 | How many times did the lead change in [season]? | After which rounds did a new competitor lead? |
| STD-10 | At what round was the [season] title secured? | When could nobody catch [champion] on points? |
| STD-11 | Who rose the most in the standings from [season a] to [season b]? | Which team improved its final rank most year over year? |
| STD-12 | Which champion won with the fewest race victories? | Who had the highest points total among champions? |
| STD-13 | How much did [driver] close the gap to [rival] at round [round]? | What was [team]'s net points swing versus [rival] at [event]? |

## Individual careers and milestones

| ID | Variation A | Variation B |
| --- | --- | --- |
| CAR-01 | Tell me about [driver]'s career. | Give me [driver]'s archive profile. |
| CAR-02 | When did [driver] debut? | What was [driver]'s first recorded start? |
| CAR-03 | When did [driver] race for the last time? | What was [driver]'s final recorded start? |
| CAR-04 | When did [driver] first score [milestone]? | What was [driver]'s latest [milestone] result? |
| CAR-05 | Who took the most calendar time to reach a first [milestone]? | Which driver waited longest from debut to [milestone]? |
| CAR-06 | Who reached a first [milestone] in the fewest starts? | Which driver needed the fewest starts after debut to get [milestone]? |
| CAR-07 | Who needed the fewest starts to reach [N] wins? | Which driver reached [N] podiums in the fewest starts? |
| CAR-08 | Who has the most starts without a win? | Which drivers raced at least [N] times without scoring points? |
| CAR-09 | Who won their debut race? | Which drivers scored points in their first start? |
| CAR-10 | Sum up [driver]'s [season] campaign. | What were [driver]'s [class] season stats in [season]? |
| CAR-11 | What was [driver]'s highest championship finish? | Which season was [driver]'s strongest by points? |
| CAR-12 | How old was [driver] when they debuted? | What age was [driver] at their first win? |
| CAR-13 | How did [driver] do before and after joining [team]? | Compare [driver]'s results on each side of the [season] team switch. |
| CAR-14 | Which [season] races did [driver] start? | What events did [driver] miss in [season]? |

## Teams, lineups, and relationships

| ID | Variation A | Variation B |
| --- | --- | --- |
| TEAM-01 | Tell me about [team]'s history. | Give me the archive profile for [team]. |
| TEAM-02 | Who has raced for [team]? | Which drivers represented [team] in [season]? |
| TEAM-03 | Who stayed with [team] longest? | Which driver logged the most calendar time for [team]? |
| TEAM-04 | Which driver-team pairing spans the most seasons? | Who spent the greatest number of seasons with one constructor? |
| TEAM-05 | Which teammate pair shared the most race weekends? | Who started together in the same car most often? |
| TEAM-06 | What was [team]'s most recent [milestone]? | When did [team] last earn [milestone]? |
| TEAM-07 | When did [team] first achieve [milestone]? | What was [team]'s earliest recorded [milestone]? |
| TEAM-08 | What was [team]'s best season by wins? | In which season did [team] score the fewest points? |
| TEAM-09 | Which driver lineup won most often together? | What WEC crew collected the most points as a unit? |
| TEAM-10 | Who partnered [driver] across their career? | Show [driver]'s teams and teammates in order. |
| TEAM-11 | Did [team] improve after its name change? | Compare results before and after [team]'s ownership change. |
| TEAM-12 | When did [team] first race? | What was [team]'s last recorded start? |

## Records, ranks, and distributions

| ID | Variation A | Variation B |
| --- | --- | --- |
| REC-01 | Who tops the all-time [metric] list? | Rank the leaders for [metric]. |
| REC-02 | How many [metric] does [competitor] have? | What is [competitor]'s total [metric] count? |
| REC-03 | Who has the most [metric] at [circuit]? | Rank [metric] leaders in [country]. |
| REC-04 | Who led [metric] from [year a] to [year b]? | Show [season] [metric] leaders. |
| REC-05 | Which [nationality] drivers have the most [metric]? | Who has the most [metric] while driving for [team]? |
| REC-06 | Which winless driver season produced the most points? | Who scored the highest season total without a race victory? |
| REC-07 | Who won the most races in a single season? | What season had a driver with the most pole positions? |
| REC-08 | What share of starts did [driver] win? | Who has the highest podium percentage, with at least [N] starts? |
| REC-09 | What was [driver]'s average finishing position? | Who has the best median result over at least [N] starts? |
| REC-10 | How often did [driver] finish in each position? | Show the distribution of [team]'s points by score band. |
| REC-11 | Which all-time records changed at [event]? | What new record did [driver] set on [date]? |

## Comparisons and head-to-heads

| ID | Variation A | Variation B |
| --- | --- | --- |
| CMP-01 | [driver A] versus [driver B] for [metric]. | Who has more [metric], [driver A] or [driver B]? |
| CMP-02 | Compare [team A] with [team B] on [metric]. | Which manufacturer leads [metric], [A] or [B]? |
| CMP-03 | In races they both started, who had more [metric]? | Compare [A] and [B] only at their shared events. |
| CMP-04 | How did [A] fare against [B] as teammates? | Compare [A] with [B] during their [team] years. |
| CMP-05 | Who finished ahead more often, [A] or [B]? | In shared starts, how often did [A] beat [B] at the flag? |
| CMP-06 | Who outqualified whom more often, [A] or [B]? | Across shared weekends, how many times did [A] qualify ahead of [B]? |
| CMP-07 | Compare [driver]'s [season a] and [season b] results. | Was [team] more successful before or after [year]? |
| CMP-08 | Which of [season a] and [season b] had a tighter field by [metric]? | Compare competitiveness in [class A] and [class B] using [defined metric]. |
| CMP-09 | How did [A] and [B] compare as [season] teammates on points? | Who scored more points during their [team] teammate season? |

## Streaks, runs, and chronology

| ID | Variation A | Variation B |
| --- | --- | --- |
| STR-01 | Who won the most races in a row? | What is the longest consecutive [milestone] run? |
| STR-02 | What is [competitor]'s longest points streak? | How many consecutive races did [competitor] win at best? |
| STR-03 | When did [competitor]'s longest podium run begin and end? | List the events in [competitor]'s longest win streak. |
| STR-04 | Who went longest between race wins? | What was the biggest gap between [competitor]'s podiums? |
| STR-05 | When was [team]'s last scoreless event? | What was [driver]'s most recent DNF? |
| STR-06 | Who won [event] on the most consecutive visits? | How many straight appearances at [circuit] did [driver] win? |

## Points systems and what-if calculations

| ID | Variation A | Variation B |
| --- | --- | --- |
| PTS-01 | Who would take the [season] title using [rules year] points? | Re-score [season] under [rules year] rules and name the champion. |
| PTS-02 | How many titles would [driver] have on [rules year] scoring? | Count [team]'s championships using [rules year] rules throughout history. |
| PTS-03 | Who leads all-time points under [rules year] rules? | Rank career title totals after applying [rules year] scoring. |
| PTS-04 | Which seasons would crown a different winner under [rules year] rules? | How many titles flip if every season uses [rules year] points? |
| PTS-05 | How do [rules year A] and [rules year B] scoring compare for [season]? | Which rulebook awards [driver] more points, [A] or [B]? |
| PTS-06 | If [driver] finished P[position] at [event], who wins the title? | Recalculate [season] after changing [event]'s result for [team]. |
| PTS-07 | What does [driver] need at [remaining event] to clinch? | Which finishing position guarantees [team] the championship after round [round]? |
| PTS-08 | What is the highest final rank [driver] can still reach? | How many points can [team] still score at most? |
| PTS-09 | How would [season] results change with [rules year B] instead of [A]? | What difference did the [rules year] scoring change make for [driver]? |

## WEC and endurance-specific questions

| ID | Variation A | Variation B |
| --- | --- | --- |
| END-01 | Who was the overall winner at [WEC event]? | Who took [class] victory at [WEC event] [season]? |
| END-02 | Who shared [car]'s [WEC event] [season] result? | Which crew raced together most often in [season]? |
| END-03 | Where did [car] finish overall versus in [class] at [event] [season]? | What was [entry]'s overall and class position at [event] [season]? |
| END-04 | Which manufacturer has the most [class] wins? | Rank teams by [class] titles. |
| END-05 | How many [class] cars did [team] field at [event]? | Count [team]'s entries during [season]. |
| END-06 | Which [class] crew covered the greatest distance at [event]? | Who completed the most laps at [WEC event]? |
| END-07 | How did [team] perform before and after the [regulation] change? | Compare [class A] and [class B] eras using [defined metric]. |
| END-08 | Who topped wet qualifying at [event] [season]? | Which [class] car was quickest when qualifying was wet at [event] [season]? |
| END-09 | Who set the quickest lap in [named session] at [event] [season]? | Which [class] entry was fastest in [session] timing at [event] [season]? |

## Explanations, provenance, and limits

| ID | Variation A | Variation B |
| --- | --- | --- |
| EXP-01 | What does [term] mean in racing? | Explain [term] to me. |
| EXP-02 | How did you get that number? | Show the calculation behind your previous answer. |
| EXP-03 | Why was [A] ahead of [B] despite equal points? | Which countback result separated [A] and [B]? |
| EXP-04 | Which results support that total? | Show the source rows used for that answer. |
| EXP-05 | Why is [driver]'s [event] result absent? | What archive coverage is missing for [season]? |
| EXP-06 | Who is best by [defined metric] in [era]? | Rank the greatest [drivers/teams] by [explicit criterion]. |
| EXP-07 | Who is predicted to win [future event]? | What is [driver]'s chance of taking the title from here? |

## Follow-up edits shared by the types above

These are **slot operations**, not new types. Apply each to a prior answer only when that type accepts the slot. Keep every other slot, and show the resulting interpretation beside the answer.

| Operation | Example | Expected change |
| --- | --- | --- |
| Replace competitor | “What about [other driver]?” | `competitor` changes; season, class, metric and venue remain. |
| Replace entity type | “What about manufacturers?” | `entity=manufacturers`; retain class, season and metric if valid. |
| Replace metric | “Podiums instead.” | `metric=podiums`; retain competitors and all filters. |
| Replace venue | “At Le Mans instead.” | Replace the venue; do not keep the previous circuit. |
| Narrow time | “Only since 2020.” | Set lower year bound, retain upper bound if compatible. |
| Replace season | “In 2024 instead.” | Replace an existing season rather than accumulating two. |
| Replace class | “Hypercar only.” | Set `class=Hypercar`; preserve the other slots. |
| Replace cutoff | “After round 6?” | Change standings cutoff; do not use final standings. |
| Replace session | “What about the sprint?” | Change session only if that calculation supports sprint results. |
| Clear filter | “Across all circuits.” | Explicitly remove venue scope. |
| Explain evidence | “How did you calculate that?” | Reuse the previous calculation and show rows, formula and assumptions. |

## Rejection and clarification cases

For each type, the eventual evaluation set should include: an ambiguous surname or team name; a missing required subject/year/class; an unknown name; an unsupported modifier; a valid filter combination; a follow-up that edits one slot; and a question outside the archive. Example failures: “When did Schumacher debut?” must resolve Michael versus Ralf; “When did Prost debut at Spa?” must not silently answer an unfiltered debut; “Who won?” needs a race and season; “Who was fastest in wet qualifying?” needs sourced weather data. Test the **number, evidence rows, and scope** together. A correct intent with a dropped filter is a failed case.

The first executable slice is `test/ask-variation-evaluation.test.js`: 36 concrete core and WEC phrasing cases, plus explicit filter-rejection cases. Calendar types CAL-02–05 are exercised in `test/ask-calendar.test.js` across all championships. The full template table remains a roadmap; cases marked `Calculate`, `Data`, or `Define` should not be turned into positive parser tests until their tools and evidence contracts exist.
