"""
2026 FIFA World Cup Monte Carlo simulator.

Model
-----
* Each team has a World-Football-Elo rating.
* A match is simulated with a bivariate-ish Poisson goal model whose means are
  derived from the Elo difference (plus host/home advantage where it applies).
* Group stage: 12 groups of 4, round-robin, 3/1/0 points. Top 2 of each group
  plus the 8 best third-placed teams advance to a 32-team knockout.
* Knockout: single elimination; ties resolved by extra-time + penalties, modelled
  as a coin flip weighted by the pre-match Elo win expectancy.
* Goals are attributed to players via a multinomial over each team's goal-share
  profile, producing a Golden Boot race. The Golden Ball (MVP) is sampled from
  deep-running teams weighted by each team's designated talisman's star rating.

All probabilities are emergent from repeated simulation (default 100,000 runs).
"""
from __future__ import annotations
import json
import os
from collections import defaultdict, Counter
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

# ---- Tunable model constants -------------------------------------------------
BASE_TOTAL_GOALS = 2.65   # avg combined goals in a WC match
SUP_SCALE = 4.0           # maps Elo win-expectancy to goal supremacy
MIN_LAMBDA = 0.15         # floor on expected goals
HOST_HA = 60              # Elo-point home advantage for the three hosts at home


def load_json(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


class Sim:
    def __init__(self, seed=None):
        self.teams = load_json("teams.json")       # {team: {"elo": int, "group": "A", "host": bool}}
        self.groups = load_json("groups.json")      # {"A": [t1,t2,t3,t4], ...}
        self.bracket = load_json("bracket.json")    # R32 slots + tree
        self.players = load_json("players.json")    # {team: {"scorers":[{name,share}], "ball":{name,star}}}
        self.rng = np.random.default_rng(seed)
        self.team_list = list(self.teams.keys())

    # ---- Match model --------------------------------------------------------
    def _lambdas(self, a, b, neutral=True):
        ea = self.teams[a]["elo"] + (HOST_HA if (not neutral and self.teams[a].get("host")) else 0)
        eb = self.teams[b]["elo"] + (HOST_HA if (not neutral and self.teams[b].get("host")) else 0)
        we = 1.0 / (1.0 + 10 ** (-(ea - eb) / 400.0))   # A win expectancy
        sup = SUP_SCALE * (we - 0.5)                     # expected goal supremacy
        la = max(MIN_LAMBDA, (BASE_TOTAL_GOALS + sup) / 2.0)
        lb = max(MIN_LAMBDA, (BASE_TOTAL_GOALS - sup) / 2.0)
        return la, lb, we

    def play(self, a, b, knockout=False, neutral=True):
        la, lb, we = self._lambdas(a, b, neutral)
        ga = int(self.rng.poisson(la))
        gb = int(self.rng.poisson(lb))
        self._attribute(a, ga)
        self._attribute(b, gb)
        if not knockout:
            return ga, gb, None
        winner = a if ga > gb else b if gb > ga else (a if self.rng.random() < we else b)
        return ga, gb, winner

    def _attribute(self, team, goals):
        if goals <= 0:
            return
        prof = self.players.get(team)
        if not prof or not prof.get("scorers"):
            return
        names = [s["name"] for s in prof["scorers"]]
        shares = np.array([s["share"] for s in prof["scorers"]], dtype=float)
        # remaining probability mass -> "other" players (untracked), so shares need not sum to 1
        rest = max(0.0, 1.0 - shares.sum())
        probs = np.append(shares, rest)
        draw = self.rng.multinomial(goals, probs / probs.sum())
        for nm, c in zip(names, draw[:-1]):
            if c:
                self.goals[nm] += int(c)

    # ---- Group stage --------------------------------------------------------
    def group_stage(self):
        standings = {}      # team -> [pts, gd, gf]
        thirds = []
        qualifiers = {}     # "1A","2A",... -> team
        for g, teams in self.groups.items():
            tab = {t: [0, 0, 0] for t in teams}
            for i in range(len(teams)):
                for j in range(i + 1, len(teams)):
                    a, b = teams[i], teams[j]
                    ga, gb, _ = self.play(a, b, knockout=False)
                    tab[a][1] += ga - gb; tab[a][2] += ga
                    tab[b][1] += gb - ga; tab[b][2] += gb
                    if ga > gb: tab[a][0] += 3
                    elif gb > ga: tab[b][0] += 3
                    else: tab[a][0] += 1; tab[b][0] += 1
            order = sorted(teams, key=lambda t: (tab[t][0], tab[t][1], tab[t][2], self.rng.random()), reverse=True)
            qualifiers[f"1{g}"] = order[0]
            qualifiers[f"2{g}"] = order[1]
            thirds.append((g, order[2], tab[order[2]]))
            standings.update(tab)
        # best 8 third-placed
        thirds.sort(key=lambda x: (x[2][0], x[2][1], x[2][2], self.rng.random()), reverse=True)
        best_thirds = thirds[:8]
        return qualifiers, best_thirds

    # ---- Knockout -----------------------------------------------------------
    def knockout(self, qualifiers, best_thirds):
        # Assign the 8 qualifying thirds to the bracket's third-slots using the
        # official-style allocation: slots list their eligible source groups; we
        # greedily match qualifying thirds to slots, respecting same-group rules.
        third_by_group = {g: t for (g, t, _) in best_thirds}
        qualified_groups = sorted(third_by_group.keys())
        alloc_table = self.bracket["third_allocation"]
        mapping = alloc_table.get(",".join(qualified_groups))
        if mapping is None:
            # fallback: assign in slot order to any eligible qualifying group
            mapping = {}
            used = set()
            for slot in self.bracket["r32"]:
                if slot[0] == "3":
                    for g in slot[1]:
                        if g in third_by_group and g not in used:
                            mapping[self._slot_id(slot)] = g; used.add(g); break
        # build the 32-team seeded list in bracket order
        round_teams = []
        for slot in self.bracket["r32"]:
            if slot[0] == "W":
                round_teams.append(qualifiers[f"1{slot[1]}"])
            elif slot[0] == "R":
                round_teams.append(qualifiers[f"2{slot[1]}"])
            else:  # third slot
                g = mapping[self._slot_id(slot)]
                round_teams.append(third_by_group[g])

        rounds = ["R16", "QF", "SF"]
        result = {}
        # R32 -> ... down to final
        teams = round_teams
        round_names = ["R32", "R16", "QF", "SF", "F"]
        reached = {t: "R32" for t in teams}
        idx = 0
        while len(teams) > 1:
            nxt = []
            for k in range(0, len(teams), 2):
                a, b = teams[k], teams[k + 1]
                _, _, w = self.play(a, b, knockout=True)
                nxt.append(w)
                reached[w] = round_names[idx + 1]
            # capture semifinal losers for 3rd-place game
            if round_names[idx + 1] == "F":
                sf_losers = [t for t in teams if t not in nxt]
                champ_pair = nxt
            teams = nxt
            idx += 1
        champion = teams[0]
        runner_up = [t for t in champ_pair if t != champion][0]
        # 3rd place playoff
        ga, gb, third = self.play(sf_losers[0], sf_losers[1], knockout=True)
        fourth = sf_losers[1] if third == sf_losers[0] else sf_losers[0]
        reached[champion] = "W"
        reached[runner_up] = "RU"
        return champion, runner_up, third, fourth, reached

    @staticmethod
    def _slot_id(slot):
        return f"3_{'-'.join(slot[1])}"

    # ---- One full tournament ------------------------------------------------
    def run_once(self):
        self.goals = Counter()
        q, bt = self.group_stage()
        champ, ru, third, fourth, reached = self.knockout(q, bt)
        # Golden Ball: sample from deep teams weighted by talisman star * round weight
        rw = {"W": 5.0, "RU": 3.0, "SF": 1.5, "QF": 0.6}
        cands, weights = [], []
        for t, r in reached.items():
            prof = self.players.get(t)
            if prof and prof.get("ball") and r in rw:
                cands.append(prof["ball"]["name"])
                weights.append(prof["ball"]["star"] * rw[r])
        mvp = None
        if cands:
            w = np.array(weights); w = w / w.sum()
            mvp = cands[self.rng.choice(len(cands), p=w)]
        boot = self.goals.most_common(1)[0][0] if self.goals else None
        return {
            "champion": champ, "runner_up": ru, "third": third, "fourth": fourth,
            "mvp": mvp, "boot": boot,
            "boot_goals": dict(self.goals),
            "reached": reached,
        }


def main(n=100000, seed=42):
    sim = Sim(seed=seed)
    champ = Counter(); ru = Counter(); third = Counter(); fourth = Counter()
    finalist = Counter(); semi = Counter()
    mvp = Counter(); boot = Counter()
    boot_goals_total = Counter(); boot_appearances = Counter()
    for i in range(n):
        r = sim.run_once()
        champ[r["champion"]] += 1
        ru[r["runner_up"]] += 1
        third[r["third"]] += 1
        fourth[r["fourth"]] += 1
        finalist[r["champion"]] += 1; finalist[r["runner_up"]] += 1
        for t, rr in r["reached"].items():
            if rr in ("W", "RU", "SF"):
                semi[t] += 1
        if r["mvp"]:
            mvp[r["mvp"]] += 1
        if r["boot"]:
            boot[r["boot"]] += 1
        for p, g in r["boot_goals"].items():
            boot_goals_total[p] += g
            boot_appearances[p] += 1
    out = {
        "n": n,
        "champion": champ, "runner_up": ru, "third": third, "fourth": fourth,
        "finalist": finalist, "semifinalist": semi,
        "mvp": mvp, "golden_boot": boot,
        "avg_goals": {p: boot_goals_total[p] / n for p in boot_goals_total},
    }
    return out


def pct(counter, n, k=12):
    return [(t, c, 100.0 * c / n) for t, c in counter.most_common(k)]


if __name__ == "__main__":
    import sys
    N = int(sys.argv[1]) if len(sys.argv) > 1 else 100000
    res = main(N)
    n = res["n"]
    def show(title, key, k=12):
        print(f"\n=== {title} ===")
        for t, c, p in pct(res[key], n, k):
            print(f"  {t:<22} {p:6.2f}%  ({c})")
    show("CHAMPION", "champion")
    show("RUNNER-UP", "runner_up")
    show("THIRD PLACE", "third")
    show("REACH FINAL", "finalist")
    show("REACH SEMIS", "semifinalist")
    show("GOLDEN BALL (MVP)", "mvp", 10)
    show("GOLDEN BOOT", "golden_boot", 10)
    print("\n=== AVG GOALS / TOURNAMENT (top 10) ===")
    for p, g in sorted(res["avg_goals"].items(), key=lambda x: -x[1])[:10]:
        print(f"  {p:<22} {g:4.2f}")
