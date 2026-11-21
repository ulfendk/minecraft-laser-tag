package dk.ulfen.lasertag.game;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import dk.ulfen.lasertag.LaserData;
import org.jspecify.annotations.Nullable;

/**
 * The rules of the game, with no Minecraft in them: scores, streaks, flags, control
 * points, heat and the end of a round. The same as src/lib/game.mjs (which the Bedrock
 * scripts use); a game test replays games recorded there (tools/fixtures.mjs) and
 * compares. A game is plain data, saved as JSON.
 */
public final class GameLogic {
	private GameLogic() {}

	public static final class State {
		public String mode;
		public String phase;
		public int countdown;
		public int clock;
		public int left;
		public int scoreLimit;
		public List<String> teams = new ArrayList<>();
		public LinkedHashMap<String, Integer> scores = new LinkedHashMap<>();
		public LinkedHashMap<String, Stat> stats = new LinkedHashMap<>();
		public LinkedHashMap<String, Flag> flags = new LinkedHashMap<>();
		public LinkedHashMap<String, Point> points = new LinkedHashMap<>();
		/** Where the console is: the dimension and position. Set by the runtime. */
		public @Nullable String dim;
		public double x, y, z;
	}

	public static final class Stat {
		public int tags, tagged, shots, hits, captures, streak, best;
		public List<Integer> recent = new ArrayList<>();
	}

	public static final class Flag {
		public String state = "home";
		public @Nullable String carrier;
		public double @Nullable [] pos;
		public int returnAt;

		static Flag home() {
			return new Flag();
		}
	}

	public static final class Point {
		public @Nullable String owner;
		public @Nullable String team;
		public int progress;
	}

	/** Something that happened: `type`, plus who/what it was about. */
	public record Event(String type, @Nullable String who, @Nullable String team, @Nullable String flag, @Nullable String name, @Nullable String key, int n, boolean hasWinner, @Nullable String winner) {
		static Event of(String type) {
			return new Event(type, null, null, null, null, null, 0, false, null);
		}

		/** As tools/fixtures.mjs writes it: type[:name][:winner]. */
		public String label() {
			return type + (name != null ? ":" + name : "") + (hasWinner ? ":" + winner : "");
		}
	}

	public record Heat(double heat, boolean overheated) {}

	private static LaserData.Rules R() {
		return LaserData.rules();
	}

	public static List<String> modes() {
		return new ArrayList<>(R().modes().keySet());
	}

	public static State newGame(String mode, int minutes, int scoreLimit, int teams) {
		LaserData.Mode m = R().modes().get(mode);
		State g = new State();
		g.mode = m != null ? mode : "team_deathmatch";
		if (m == null) m = R().modes().get(g.mode);
		g.phase = "countdown";
		g.countdown = R().console().countdown();
		g.left = minutes * 60;
		g.scoreLimit = scoreLimit > 0 ? scoreLimit : m.scoreLimit();
		int n = Math.max(2, Math.min(R().teams().size(), teams));
		g.teams = new ArrayList<>(R().teams().subList(0, n));
		if (m.teams()) for (String t : g.teams) g.scores.put(t, 0);
		for (String t : g.teams) g.flags.put(t, Flag.home());
		return g;
	}

	public static boolean teamMode(State g) {
		return R().modes().get(g.mode).teams();
	}

	/** Whether `a` (on team `ta`) may tag `b` (on team `tb`): never yourself, never your own team (except in free-for-all). */
	public static boolean enemies(@Nullable State g, String a, String ta, String b, String tb) {
		if (a.equals(b)) return false;
		if (g == null || teamMode(g)) return !ta.equals(tb);
		return true;
	}

	private static Stat stat(State g, String who) {
		return g.stats.computeIfAbsent(who, k -> new Stat());
	}

	private static void addScore(State g, String key, int n) {
		g.scores.merge(key, n, Integer::sum);
	}

	private static int at(List<Object> pair) {
		return ((Number) pair.get(0)).intValue();
	}

	public static @Nullable String streakName(int n) {
		for (List<Object> s : R().streaks()) if (at(s) == n) return (String) s.get(1);
		return null;
	}

	public static @Nullable String multiName(int n) {
		String name = null;
		for (List<Object> m : R().multis()) if (n >= at(m)) name = (String) m.get(1);
		return name;
	}

	public static void onShot(@Nullable State g, String who, int hits) {
		if (g == null || !g.phase.equals("running")) return;
		Stat s = stat(g, who);
		s.shots++;
		if (hits > 0) s.hits++;
	}

	/** `who` (team `team`) tagged `target` (team `targetTeam`) at `pos`. */
	public static List<Event> onTag(@Nullable State g, String who, String team, String target, String targetTeam, double @Nullable [] pos, boolean doublePoints) {
		List<Event> events = new ArrayList<>();
		if (g == null || !g.phase.equals("running")) return events;
		Stat s = stat(g, who);
		Stat t = stat(g, target);
		s.tags++;
		s.streak++;
		s.best = Math.max(s.best, s.streak);
		List<Integer> recent = new ArrayList<>();
		for (int c : s.recent) if (g.clock - c < R().tag().multiWindow()) recent.add(c);
		recent.add(g.clock);
		s.recent = recent;
		t.tagged++;
		t.streak = 0;
		int points = doublePoints ? 2 : 1;
		if (g.mode.equals("team_deathmatch")) addScore(g, team, points);
		if (g.mode.equals("free_for_all")) addScore(g, who, points);
		if (g.mode.equals("team_deathmatch") || g.mode.equals("free_for_all")) {
			events.add(new Event("score", null, null, null, null, g.mode.equals("free_for_all") ? who : team, points, false, null));
		}
		String streak = streakName(s.streak);
		if (streak != null) events.add(new Event("streak", who, null, null, streak, null, 0, false, null));
		String multi = s.recent.size() >= 2 ? multiName(s.recent.size()) : null;
		if (multi != null) events.add(new Event("multi", who, null, null, multi, null, 0, false, null));
		events.addAll(dropFlags(g, target, pos));
		checkLimit(g, events);
		return events;
	}

	// ---------------------------------------------------------------- capture the flag

	public static List<String> carrying(@Nullable State g, String who) {
		List<String> out = new ArrayList<>();
		if (g == null) return out;
		for (var e : g.flags.entrySet()) if (e.getValue().state.equals("carried") && who.equals(e.getValue().carrier)) out.add(e.getKey());
		return out;
	}

	public static List<Event> dropFlags(State g, String who, double @Nullable [] pos) {
		List<Event> events = new ArrayList<>();
		for (String f : carrying(g, who)) {
			Flag flag = new Flag();
			flag.state = "dropped";
			flag.pos = pos;
			flag.returnAt = g.clock + R().flag().returnAfter();
			g.flags.put(f, flag);
			events.add(new Event("flag_dropped", who, null, f, null, null, 0, false, null));
		}
		return events;
	}

	/** `who` (team `team`) touches the flag stand of `standTeam`. */
	public static List<Event> touchStand(@Nullable State g, String who, String team, String standTeam) {
		List<Event> events = new ArrayList<>();
		if (g == null || !g.mode.equals("capture_the_flag") || !g.phase.equals("running")) return events;
		Flag flag = g.flags.get(standTeam);
		if (flag == null) return events;
		if (team.equals(standTeam)) {
			List<String> held = carrying(g, who);
			if (held.isEmpty() || !flag.state.equals("home")) return events;
			for (String f : held) {
				g.flags.put(f, Flag.home());
				addScore(g, team, 1);
				stat(g, who).captures++;
				events.add(new Event("captured", who, team, f, null, null, 0, false, null));
			}
			checkLimit(g, events);
		} else if (flag.state.equals("home") && g.flags.containsKey(team)) {
			Flag taken = new Flag();
			taken.state = "carried";
			taken.carrier = who;
			g.flags.put(standTeam, taken);
			events.add(new Event("flag_taken", who, null, standTeam, null, null, 0, false, null));
		}
		return events;
	}

	/** `who` (team `team`) touches the dropped flag of `flagTeam`. */
	public static List<Event> touchDropped(@Nullable State g, String who, String team, String flagTeam) {
		List<Event> events = new ArrayList<>();
		Flag flag = g == null ? null : g.flags.get(flagTeam);
		if (flag == null || !flag.state.equals("dropped") || !g.phase.equals("running")) return events;
		if (team.equals(flagTeam)) {
			g.flags.put(flagTeam, Flag.home());
			events.add(new Event("flag_returned", who, null, flagTeam, null, null, 0, false, null));
		} else if (g.flags.containsKey(team)) {
			Flag taken = new Flag();
			taken.state = "carried";
			taken.carrier = who;
			g.flags.put(flagTeam, taken);
			events.add(new Event("flag_taken", who, null, flagTeam, null, null, 0, false, null));
		}
		return events;
	}

	// ---------------------------------------------------------------- control points

	public record Pushed(Point point, @Nullable Event event) {}

	/** One second at a control point; `counts`: active players of each team next to it. */
	public static Pushed pushPoint(@Nullable Point point, Map<String, Integer> counts) {
		LaserData.Point P = R().point();
		Point p = new Point();
		if (point != null) {
			p.owner = point.owner;
			p.team = point.team;
			p.progress = point.progress;
		}
		List<Map.Entry<String, Integer>> present = new ArrayList<>();
		for (var e : counts.entrySet()) if (e.getValue() > 0) present.add(e);
		Event event = null;
		if (present.size() == 1) {
			String team = present.get(0).getKey();
			int push = Math.min(present.get(0).getValue(), P.maxPush());
			if (team.equals(p.owner)) {
				p.team = team;
				p.progress = P.capture();
			} else if (p.owner != null) {
				p.progress -= push;
				if (p.progress <= 0) {
					event = new Event("point_lost", null, p.owner, null, null, null, 0, false, null);
					p.owner = null;
					p.team = team;
					p.progress = 0;
				}
			} else if (p.team != null && !p.team.equals(team) && p.progress > 0) {
				p.progress = Math.max(0, p.progress - push);
				if (p.progress == 0) p.team = team;
			} else {
				p.team = team;
				p.progress = Math.min(P.capture(), p.progress + push);
				if (p.progress >= P.capture()) {
					p.owner = team;
					event = new Event("point_taken", null, team, null, null, null, 0, false, null);
				}
			}
		} else if (present.isEmpty()) {
			if (p.owner != null) p.progress = Math.min(P.capture(), p.progress + P.decay());
			else if (p.progress > 0) {
				p.progress = Math.max(0, p.progress - P.decay());
				if (p.progress == 0) p.team = null;
			}
		}
		return new Pushed(p, event);
	}

	// ---------------------------------------------------------------- the clock

	/** One second of the game. `points`: counts for every control point in the arena. */
	public static List<Event> second(@Nullable State g, Map<String, Map<String, Integer>> points) {
		List<Event> events = new ArrayList<>();
		if (g == null || g.phase.equals("over")) return events;
		if (g.phase.equals("countdown")) {
			g.countdown--;
			if (g.countdown > 0) events.add(new Event("countdown", null, null, null, null, null, g.countdown, false, null));
			else {
				g.phase = "running";
				events.add(Event.of("go"));
			}
			return events;
		}
		g.clock++;
		g.left--;
		if (g.left == R().console().warnAt()) events.add(Event.of("minute"));
		for (var e : g.flags.entrySet()) {
			Flag f = e.getValue();
			if (f.state.equals("dropped") && g.clock >= f.returnAt) {
				e.setValue(Flag.home());
				events.add(new Event("flag_returned", null, null, e.getKey(), null, null, 0, false, null));
			}
		}
		if (g.mode.equals("king_of_the_hill")) {
			for (var e : points.entrySet()) {
				Pushed pushed = pushPoint(g.points.get(e.getKey()), e.getValue());
				g.points.put(e.getKey(), pushed.point());
				if (pushed.event() != null) {
					Event ev = pushed.event();
					events.add(new Event(ev.type(), ev.who(), ev.team(), ev.flag(), ev.name(), e.getKey(), ev.n(), false, null));
				}
				String owner = pushed.point().owner;
				if (owner != null && g.scores.containsKey(owner)) addScore(g, owner, 1);
			}
			g.points.keySet().removeIf(k -> !points.containsKey(k));
		}
		checkLimit(g, events);
		if (!g.phase.equals("over") && g.left <= 0) finish(g, events);
		return events;
	}

	private static void checkLimit(State g, List<Event> events) {
		if (!g.phase.equals("running") || g.scoreLimit <= 0) return;
		for (int s : g.scores.values()) {
			if (s >= g.scoreLimit) {
				finish(g, events);
				return;
			}
		}
	}

	private static void finish(State g, List<Event> events) {
		g.phase = "over";
		events.add(new Event("over", null, null, null, null, null, 0, true, winner(g)));
	}

	public static List<Event> stop(@Nullable State g) {
		List<Event> events = new ArrayList<>();
		if (g != null && !g.phase.equals("over")) finish(g, events);
		return events;
	}

	/** Scores from the top; ties keep the order they were added in. */
	public static List<Map.Entry<String, Integer>> standings(@Nullable State g) {
		List<Map.Entry<String, Integer>> list = new ArrayList<>(g == null ? List.of() : g.scores.entrySet());
		list.sort((a, b) -> b.getValue() - a.getValue());
		return list;
	}

	public static @Nullable String winner(@Nullable State g) {
		List<Map.Entry<String, Integer>> s = standings(g);
		if (s.isEmpty() || s.get(0).getValue() <= 0 || (s.size() > 1 && s.get(1).getValue().equals(s.get(0).getValue()))) return null;
		return s.get(0).getKey();
	}

	public static int accuracy(Stat s) {
		return s.shots == 0 ? 0 : Math.round(100.0F * s.hits / s.shots);
	}

	public static @Nullable String mvp(@Nullable State g) {
		String best = null;
		int bestScore = 0;
		if (g == null) return null;
		for (var e : g.stats.entrySet()) {
			Stat s = e.getValue();
			int score = 2 * s.tags + 5 * s.captures - s.tagged;
			if (score > bestScore) {
				best = e.getKey();
				bestScore = score;
			}
		}
		return best;
	}

	// ---------------------------------------------------------------- guns

	public static Heat shotHeat(Heat h, String gun, boolean rapid) {
		if (rapid) return new Heat(h.heat(), false);
		double heat = Math.min(R().heat().max(), h.heat() + R().guns().get(gun).heat());
		return new Heat(heat, heat >= R().heat().max());
	}

	public static Heat cool(Heat h, double seconds) {
		double rate = h.overheated() ? R().heat().overheatCoolPerSecond() : R().heat().coolPerSecond();
		double heat = Math.max(0, h.heat() - rate * seconds);
		return new Heat(heat, h.overheated() && heat > 0);
	}

	public static String heatBar(Heat h) {
		int n = (int) Math.round(h.heat() / R().heat().max() * 10);
		return "▮".repeat(n) + "▯".repeat(10 - n);
	}

	public static String pickPowerup(double r) {
		List<String> kinds = new ArrayList<>(R().powerups().kinds().keySet());
		return kinds.get(Math.min(kinds.size() - 1, (int) Math.floor(r * kinds.size())));
	}

	public static List<String> botTeams(State g, int perTeam) {
		List<String> out = new ArrayList<>();
		for (int i = 0; i < perTeam; i++) out.addAll(g.teams);
		return out;
	}

	public static String clockText(int seconds) {
		int s = Math.max(0, seconds);
		return (s / 60) + ":" + String.format("%02d", s % 60);
	}
}
