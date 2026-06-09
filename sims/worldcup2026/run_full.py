"""Run the full 100k Monte Carlo, dump JSON, and build a representative
("chalk") bracket where the pre-match favourite advances at every step."""
import json, os, sys
from collections import Counter
import numpy as np
from engine import Sim, main, HERE

N = int(sys.argv[1]) if len(sys.argv) > 1 else 100000


def chalk_bracket():
    """Deterministic bracket: in each group the highest-Elo team wins, 2nd =
    next; 8 best thirds by Elo; then favourite (higher win expectancy) advances
    each knockout round. Shows the single most-probable structural outcome."""
    sim = Sim(seed=1)
    elo = {t: sim.teams[t]["elo"] for t in sim.teams}
    qualifiers, thirds = {}, []
    for g, teams in sim.groups.items():
        order = sorted(teams, key=lambda t: elo[t], reverse=True)
        qualifiers[f"1{g}"] = order[0]
        qualifiers[f"2{g}"] = order[1]
        thirds.append((g, order[2]))
    thirds.sort(key=lambda x: elo[x[1]], reverse=True)
    third_by_group = {g: t for g, t in thirds[:8]}
    # fill bracket slots
    slots = sim.bracket["r32"]
    third_idx = [i for i, s in enumerate(slots) if s[0] == "3"]
    elig = {i: [g for g in slots[i][1] if g in third_by_group] for i in third_idx}
    sim.rng = np.random.default_rng(0)
    assign = sim._bipartite_match(third_idx, elig)
    teams = []
    for i, s in enumerate(slots):
        if s[0] == "W": teams.append(qualifiers[f"1{s[1]}"])
        elif s[0] == "R": teams.append(qualifiers[f"2{s[1]}"])
        else: teams.append(third_by_group[assign[i]])
    rounds = {"R32": list(teams)}
    labels = ["R16", "QF", "SF", "F", "W"]
    li = 0
    while len(teams) > 1:
        nxt = []
        for k in range(0, len(teams), 2):
            a, b = teams[k], teams[k + 1]
            nxt.append(a if elo[a] >= elo[b] else b)
        rounds[labels[li]] = list(nxt)
        teams = nxt; li += 1
    return rounds, qualifiers, third_by_group


def fmt(counter, n, k):
    return [{"name": t, "pct": round(100 * c / n, 2), "count": c} for t, c in counter.most_common(k)]


if __name__ == "__main__":
    res = main(N, seed=2026)
    n = res["n"]
    out = {
        "runs": n,
        "champion": fmt(res["champion"], n, 16),
        "runner_up": fmt(res["runner_up"], n, 16),
        "third": fmt(res["third"], n, 12),
        "fourth": fmt(res["fourth"], n, 12),
        "reach_final": fmt(res["finalist"], n, 16),
        "reach_semis": fmt(res["semifinalist"], n, 16),
        "golden_ball": fmt(res["mvp"], n, 12),
        "golden_boot": fmt(res["golden_boot"], n, 12),
        "avg_goals": sorted(
            [{"name": p, "avg": round(g, 3)} for p, g in res["avg_goals"].items()],
            key=lambda x: -x["avg"])[:15],
    }
    rounds, quals, thirds = chalk_bracket()
    glist = sorted(json.load(open(os.path.join(HERE, "data", "groups.json"))))
    out["chalk_bracket"] = rounds
    out["chalk_group_winners"] = {g: quals[f"1{g}"] for g in glist}
    out["chalk_runners_up"] = {g: quals[f"2{g}"] for g in glist}
    out["chalk_best_thirds"] = thirds
    with open(os.path.join(HERE, "results.json"), "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    def show(title, key, k=12):
        print(f"\n=== {title} ===")
        for row in out[key][:k]:
            print(f"  {row['name']:<22} {row['pct']:6.2f}%")
    show("CHAMPION", "champion", 16)
    show("RUNNER-UP", "runner_up", 12)
    show("THIRD PLACE", "third", 8)
    show("REACH FINAL", "reach_final", 12)
    show("REACH SEMIS", "reach_semis", 12)
    show("GOLDEN BALL (MVP)", "golden_ball", 10)
    show("GOLDEN BOOT", "golden_boot", 10)
    print("\nResults written to results.json")
