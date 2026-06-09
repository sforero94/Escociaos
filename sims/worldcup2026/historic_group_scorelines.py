"""Historic group-stage scoreline distribution, last 3 World Cups (2014/2018/2022).

All 48 group matches per tournament (144 total), compiled from match records.
Scorelines are tallied as unordered (winner_goals-loser_goals; draws as X-X),
which is the conventional "score distribution" view.
"""
from collections import Counter

# Each entry is (goals_home, goals_away) — order within a match is irrelevant to
# the unordered scoreline tally below.
WC2022 = [
    # Group A
    (0,2),(0,2),(1,3),(1,1),(1,2),(2,0),
    # Group B
    (6,2),(1,1),(0,2),(0,0),(0,3),(0,1),
    # Group C
    (1,2),(0,0),(2,0),(2,0),(0,2),(1,2),
    # Group D
    (0,0),(4,1),(0,1),(2,1),(1,0),(1,0),
    # Group E
    (1,2),(7,0),(0,1),(1,1),(2,1),(2,4),
    # Group F
    (0,0),(1,0),(0,2),(4,1),(0,0),(1,2),
    # Group G
    (1,0),(2,0),(3,3),(1,0),(2,3),(1,0),
    # Group H
    (0,0),(3,2),(2,3),(2,0),(0,2),(2,1),
]

WC2018 = [
    # Group A
    (5,0),(0,1),(3,1),(1,0),(3,0),(2,1),
    # Group B
    (0,1),(3,3),(1,0),(0,1),(1,1),(2,2),
    # Group C
    (2,1),(0,1),(1,1),(1,0),(0,0),(0,2),
    # Group D
    (1,1),(2,0),(0,3),(2,0),(1,2),(1,2),
    # Group E
    (0,1),(1,1),(2,0),(1,2),(0,2),(2,2),
    # Group F
    (0,1),(1,0),(1,2),(2,1),(2,0),(0,3),
    # Group G
    (3,0),(1,2),(5,2),(6,1),(0,1),(1,2),
    # Group H
    (1,2),(1,2),(2,2),(0,3),(0,1),(0,1),
]

WC2014 = [
    # Group A
    (3,1),(1,0),(0,0),(0,4),(1,4),(1,3),
    # Group B
    (1,5),(3,1),(2,3),(0,2),(0,3),(2,0),
    # Group C
    (3,0),(2,1),(2,1),(0,0),(1,4),(2,1),
    # Group D
    (1,3),(1,2),(2,1),(0,1),(0,1),(0,0),
    # Group E
    (2,1),(3,0),(2,5),(1,2),(0,3),(0,0),
    # Group F
    (2,1),(0,0),(1,0),(1,0),(2,3),(3,1),
    # Group G
    (4,0),(1,2),(2,2),(2,2),(0,1),(2,1),
    # Group H
    (2,1),(1,1),(1,0),(2,4),(0,1),(1,1),
]

ALL = {"2014": WC2014, "2018": WC2018, "2022": WC2022}


def scoreline(m):
    a, b = m
    hi, lo = max(a, b), min(a, b)
    return f"{hi}-{lo}"


def tally(matches):
    return Counter(scoreline(m) for m in matches)


def goals(matches):
    return sum(a + b for a, b in matches)


if __name__ == "__main__":
    combined = WC2014 + WC2018 + WC2022
    assert len(combined) == 144, len(combined)
    for yr, ms in ALL.items():
        assert len(ms) == 48, (yr, len(ms))

    c = tally(combined)
    draws = sum(v for k, v in c.items() if k.split("-")[0] == k.split("-")[1])
    decis = 144 - draws
    print(f"Total matches: 144 | goals: {goals(combined)} "
          f"({goals(combined)/144:.2f}/match) | draws: {draws} ({draws/144*100:.1f}%) "
          f"| decisive: {decis} ({decis/144*100:.1f}%)\n")
    print(f"{'Score':>6}  {'Count':>5}  {'%':>5}   per-tournament (14/18/22)")
    peryr = {y: tally(m) for y, m in ALL.items()}
    for sc, n in c.most_common():
        spl = f"{peryr['2014'][sc]}/{peryr['2018'][sc]}/{peryr['2022'][sc]}"
        print(f"{sc:>6}  {n:>5}  {n/144*100:>4.1f}%   {spl}")
