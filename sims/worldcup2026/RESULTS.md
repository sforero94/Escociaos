# 2026 FIFA World Cup — Monte Carlo Simulation Results

**100,000 tournaments simulated.** Elo-driven Poisson goal model. Inputs reflect the
real final draw (Dec 5, 2025), current World Football Elo (June 6, 2026), and
2025-26 squad/scorer data. Denmark and Italy did **not** qualify; Czechia took
Denmark's playoff spot (Group A).

---

## 🏆 The Picks

| Award | Pick | Probability |
|---|---|---|
| **Champion** | 🇪🇸 **Spain** | 29.8% |
| **Runner-up** | 🇦🇷 **Argentina** | most-likely final opponent |
| **Third place** | 🇫🇷 **France** | 12.4% to finish 3rd |
| **Golden Ball (MVP)** | **Lamine Yamal** (Spain) | 20.1% |
| **Golden Boot** | **Kylian Mbappé** (France) | 20.0% |

The single most-probable bracket ("chalk") ends **Spain 🆚 Argentina** in the final
at MetLife Stadium, with Spain lifting the trophy.

---

## Champion probability (top 12)

| Team | Win title |
|---|---|
| Spain | 29.8% |
| Argentina | 20.5% |
| France | 12.5% |
| England | 7.2% |
| Brazil | 4.7% |
| Portugal | 4.5% |
| Colombia | 3.9% |
| Netherlands | 2.3% |
| Ecuador | 2.0% |
| Germany | 1.8% |
| Norway | 1.4% |
| Croatia | 1.2% |

## Reach the final

| Team | % |
|---|---|
| Spain | 41.9% |
| Argentina | 33.7% |
| France | 22.3% |
| England | 15.3% |
| Brazil | 10.7% |
| Portugal | 10.5% |
| Colombia | 9.5% |

## Golden Ball (MVP)

| Player | Team | % |
|---|---|---|
| Lamine Yamal | Spain | 20.1% |
| Lionel Messi | Argentina | 16.1% |
| Kylian Mbappé | France | 12.8% |
| Jude Bellingham | England | 7.3% |
| Vinícius Júnior | Brazil | 6.6% |
| Bruno Fernandes | Portugal | 5.3% |

## Golden Boot (top scorer)

| Player | Team | % |
|---|---|---|
| Kylian Mbappé | France | 20.0% |
| Lautaro Martínez | Argentina | 11.9% |
| Harry Kane | England | 10.6% |
| Mikel Oyarzabal | Spain | 8.1% |
| Erling Haaland | Norway | 6.1% |
| Luis Díaz | Colombia | 3.8% |

---

## Most-likely bracket (favourite advances each round)

**Group winners:** A Mexico · B Switzerland · C Brazil · D Türkiye · E Ecuador ·
F Netherlands · G Belgium · H Spain · I France · J Argentina · K Portugal · L England

```
QUARTERFINALS                SEMIFINALS           FINAL
France  ─┐
         ├─ France ──┐
Netherl.─┘           ├─ France ──┐
Spain   ─┐           │           │
         ├─ Spain ───┘           ├─ Spain ──┐
Türkiye ─┘                       │          │
                                 │          ├── 🏆 SPAIN
Brazil  ─┐                       │          │
         ├─ England ─┐           │          │
England ─┘           ├─ Argentina┘          │
Argentina┐           │                      │
         ├─ Argentina┘   Argentina ─────────┘
Portugal ┘
```

> Note: the "chalk" bracket is the *single* most structurally probable path
> (higher-Elo side wins every game). It is not the same as the aggregate
> probabilities above — in 100k random runs Spain wins 29.8% of the time, not
> always. The bracket shows the modal outcome; the percentages show the full
> distribution.

---

## Method (how the numbers are made)

1. **Per-game probability.** Each team has a World-Football-Elo rating. For a match,
   the Elo gap (plus a 60-point home edge for hosts Mexico/Canada/USA at home)
   gives a win expectancy `We = 1/(1+10^(-ΔElo/400))`.
2. **Goals (Poisson).** `We` is converted to an expected goal supremacy
   (`sup = 4·(We−0.5)`) around a 2.65-goal match baseline, giving each side a
   Poisson mean. Real scorelines (and draws) are drawn from those Poissons.
3. **Group stage.** 12 groups, round-robin, 3/1/0 points, ranked by pts → GD → GF.
   Top 2 + 8 best third-placed teams advance (third-place slots filled by a valid
   bipartite matching respecting FIFA's same-group separation rule).
4. **Knockout.** Single elimination on the official 2026 bracket tree; ties after
   regulation resolved by an Elo-weighted extra-time/penalties coin flip.
5. **Golden Boot.** Every simulated goal is attributed to a player via a multinomial
   over that team's goal-share profile.
6. **Golden Ball.** Sampled from deep-running teams, weighted by each team's
   talisman star rating × the round they reached.
7. **Repeat 100,000×** and aggregate. All percentages are emergent frequencies.

### Caveats
- Elo for teams outside the verified top-20 are estimates (±25). They mostly affect
  minnows and have little impact on the title race.
- Goal-share profiles are informed estimates, not official data.
- The exact FIFA 495-row third-place allocation table isn't public; any valid
  eligibility-respecting assignment is equivalent for aggregate outcomes.
