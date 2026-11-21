package dk.ulfen.lasertag.test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import dk.ulfen.lasertag.LaserData;
import dk.ulfen.lasertag.LaserRegistry;
import dk.ulfen.lasertag.block.ControlPointBlock;
import dk.ulfen.lasertag.block.FlagStandBlock;
import dk.ulfen.lasertag.entity.LaserBot;
import dk.ulfen.lasertag.game.Arena;
import dk.ulfen.lasertag.game.Game;
import dk.ulfen.lasertag.game.GameLogic;
import dk.ulfen.lasertag.game.Lasers;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Server-side checks run by `./gradlew runGameTest` (and in CI). */
public class LaserTagGameTests {
	private static final String AREA = "lasertag-test:empty_large";

	// ---------------------------------------------------------------- the rules are the same as on Bedrock

	private static Map<String, Object> snapshot(GameLogic.State g) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("phase", g.phase);
		out.put("left", g.left);
		out.put("clock", g.clock);
		out.put("scores", new LinkedHashMap<>(g.scores));
		Map<String, String> flags = new LinkedHashMap<>();
		g.flags.forEach((k, f) -> flags.put(k, f.state + "/" + f.carrier));
		out.put("flags", flags);
		Map<String, String> points = new LinkedHashMap<>();
		g.points.forEach((k, p) -> points.put(k, p.owner + "/" + p.team + "/" + p.progress));
		out.put("points", points);
		return out;
	}

	private static Map<String, Object> expected(JsonObject s) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("phase", s.get("phase").getAsString());
		out.put("left", s.get("left").getAsInt());
		out.put("clock", s.get("clock").getAsInt());
		Map<String, Integer> scores = new LinkedHashMap<>();
		s.getAsJsonObject("scores").entrySet().forEach(e -> scores.put(e.getKey(), e.getValue().getAsInt()));
		out.put("scores", scores);
		Map<String, String> flags = new LinkedHashMap<>();
		s.getAsJsonObject("flags").entrySet().forEach(e -> {
			JsonObject f = e.getValue().getAsJsonObject();
			flags.put(e.getKey(), f.get("state").getAsString() + "/" + (f.get("carrier").isJsonNull() ? null : f.get("carrier").getAsString()));
		});
		out.put("flags", flags);
		Map<String, String> points = new LinkedHashMap<>();
		s.getAsJsonObject("points").entrySet().forEach(e -> {
			JsonObject p = e.getValue().getAsJsonObject();
			String owner = p.get("owner").isJsonNull() ? null : p.get("owner").getAsString();
			String team = p.get("team").isJsonNull() ? null : p.get("team").getAsString();
			points.put(e.getKey(), owner + "/" + team + "/" + p.get("progress").getAsInt());
		});
		out.put("points", points);
		return out;
	}

	private static String str(JsonObject o, String key) {
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : null;
	}

	private static Map<String, Map<String, Integer>> points(JsonObject args) {
		Map<String, Map<String, Integer>> out = new LinkedHashMap<>();
		if (!args.has("points")) return out;
		args.getAsJsonObject("points").entrySet().forEach(e -> {
			Map<String, Integer> counts = new LinkedHashMap<>();
			e.getValue().getAsJsonObject().entrySet().forEach(c -> counts.put(c.getKey(), c.getValue().getAsInt()));
			out.put(e.getKey(), counts);
		});
		return out;
	}

	/** Games played with the JavaScript rules (tools/fixtures.mjs) come out the same here. */
	@GameTest(structure = AREA)
	public void rulesMatchJavaScript(GameTestHelper helper) {
		JsonObject fx = LaserData.fixtures().getAsJsonObject();
		for (JsonElement ge : fx.getAsJsonArray("games")) {
			JsonObject gameFx = ge.getAsJsonObject();
			JsonObject settings = gameFx.getAsJsonObject("settings");
			String name = gameFx.get("name").getAsString();
			GameLogic.State g = GameLogic.newGame(str(settings, "mode"),
				settings.has("minutes") ? settings.get("minutes").getAsInt() : LaserData.rules().console().startMinutes(),
				settings.has("scoreLimit") ? settings.get("scoreLimit").getAsInt() : 0,
				settings.has("teams") ? settings.get("teams").getAsInt() : 2);
			int i = 0;
			for (JsonElement se : gameFx.getAsJsonArray("steps")) {
				JsonObject step = se.getAsJsonObject();
				JsonObject args = step.getAsJsonObject("args");
				String op = step.get("op").getAsString();
				List<GameLogic.Event> events = new ArrayList<>();
				switch (op) {
					case "second" -> events = GameLogic.second(g, points(args));
					case "seconds" -> {
						for (int n = 0; n < args.get("n").getAsInt(); n++) events.addAll(GameLogic.second(g, points(args)));
					}
					case "shot" -> GameLogic.onShot(g, str(args, "who"), args.get("hits").getAsInt());
					case "tag" -> {
						double[] pos = null;
						if (args.has("pos")) {
							var a = args.getAsJsonArray("pos");
							pos = new double[] {a.get(0).getAsDouble(), a.get(1).getAsDouble(), a.get(2).getAsDouble()};
						}
						events = GameLogic.onTag(g, str(args, "who"), str(args, "team"), str(args, "target"), str(args, "targetTeam"), pos,
							args.has("double") && args.get("double").getAsBoolean());
					}
					case "stand" -> events = GameLogic.touchStand(g, str(args, "who"), str(args, "team"), str(args, "standTeam"));
					case "dropped" -> events = GameLogic.touchDropped(g, str(args, "who"), str(args, "team"), str(args, "flagTeam"));
					case "stop" -> events = GameLogic.stop(g);
					default -> helper.fail("Unknown op " + op);
				}
				List<String> labels = events.stream().map(GameLogic.Event::label).toList();
				List<String> want = new ArrayList<>();
				step.getAsJsonArray("events").forEach(e -> want.add(e.getAsString()));
				if (!labels.equals(want)) helper.fail(name + " step " + i + " (" + op + "): events " + labels + ", JavaScript had " + want);
				Map<String, Object> got = snapshot(g);
				Map<String, Object> exp = expected(step.getAsJsonObject("state"));
				if (!got.equals(exp)) helper.fail(name + " step " + i + " (" + op + "): " + got + ", JavaScript had " + exp);
				i++;
			}
			if (!Objects.equals(GameLogic.winner(g), str(gameFx, "winner"))) helper.fail(name + ": winner " + GameLogic.winner(g) + ", JavaScript had " + str(gameFx, "winner"));
			if (!Objects.equals(GameLogic.mvp(g), str(gameFx, "mvp"))) helper.fail(name + ": MVP " + GameLogic.mvp(g) + ", JavaScript had " + str(gameFx, "mvp"));
		}
		GameLogic.Heat h = new GameLogic.Heat(0, false);
		for (JsonElement he : fx.getAsJsonArray("heat")) {
			JsonObject s = he.getAsJsonObject();
			h = switch (s.get("op").getAsString()) {
				case "shot" -> GameLogic.shotHeat(h, "laser_blaster", false);
				case "cool" -> GameLogic.cool(h, 0.5);
				default -> GameLogic.shotHeat(h, "laser_rifle", true);
			};
			if (Math.abs(h.heat() - s.get("heat").getAsDouble()) > 1e-6 || h.overheated() != s.get("overheated").getAsBoolean()) {
				helper.fail("heat " + h + ", JavaScript had " + s);
			}
		}
		for (JsonElement ne : fx.getAsJsonArray("names")) {
			JsonObject s = ne.getAsJsonObject();
			int n = s.get("n").getAsInt();
			if (!Objects.equals(GameLogic.streakName(n), str(s, "streak")) || !Objects.equals(GameLogic.multiName(n), str(s, "multi"))) helper.fail("names for " + n);
		}
		helper.succeed();
	}

	// ---------------------------------------------------------------- playing laser tag

	private static LaserBot bot(GameTestHelper helper, String team, double x, double z) {
		LaserBot b = helper.spawn(LaserRegistry.LASER_BOT, new Vec3(x, 1, z));
		b.setTeam(team);
		b.setHold(true);
		b.setCustomName(net.minecraft.network.chat.Component.literal("Test " + team));
		return b;
	}

	private static Vec3 aim(LaserBot from, Entity to) {
		return to.position().add(0, 1, 0).subtract(from.getEyePosition()).normalize();
	}

	private static void check(GameTestHelper helper, boolean ok, String problem) {
		if (!ok) helper.fail(problem);
	}

	/**
	 * Plays laser tag with bots (game tests have no players), like scripts/selftest.js:
	 * tags, coming back on the pad, walls, shields, the pulse grenade, then team
	 * deathmatch with bots that fire by themselves, capture the flag, king of the hill,
	 * and a game that ends at its score limit and is cleared away.
	 */
	@GameTest(structure = AREA, maxTicks = 2200)
	public void playsLaserTag(GameTestHelper helper) {
		ServerLevel level = helper.getLevel();
		Game.reset(level.getServer());
		int down = Math.round(LaserData.rules().tag().down() * 20);
		int protect = Math.round(LaserData.rules().tag().protect() * 20);
		BlockPos console = helper.absolutePos(new BlockPos(16, 1, 12));
		helper.setBlock(new BlockPos(2, 1, 2), LaserRegistry.SPAWN_PADS.get("red"));
		helper.setBlock(new BlockPos(30, 1, 2), LaserRegistry.SPAWN_PADS.get("blue"));
		helper.setBlock(new BlockPos(2, 1, 10), LaserRegistry.FLAG_STANDS.get("red"));
		helper.setBlock(new BlockPos(30, 1, 10), LaserRegistry.FLAG_STANDS.get("blue"));
		helper.setBlock(new BlockPos(16, 1, 20), LaserRegistry.CONTROL_POINT);
		helper.setBlock(new BlockPos(16, 1, 30), LaserRegistry.POWER_STATION);
		LaserBot red = bot(helper, "red", 10.5, 34.5);
		LaserBot blue = bot(helper, "blue", 14.5, 34.5);
		LaserBot red2 = bot(helper, "red", 12.5, 30.5);
		List<LaserBot> gameBots = new ArrayList<>();
		double[] drop = new double[3];

		int t = 10;
		helper.runAfterDelay(t, () -> {
			check(helper, Arena.padsOf("red", level).size() == 1 && Arena.padsOf("blue", level).size() == 1, "the spawn pads did not register");
			check(helper, "tagged".equals(Lasers.fireRay(red, red.getEyePosition(), aim(red, blue), 20)), "a laser did not tag a bot of another team");
			check(helper, Game.isDown(blue) && blue.isDown(), "the tagged bot is not out");
			check(helper, Game.tag(red, red2) == null, "a bot tagged its own team");
		});
		t += down + 10;
		helper.runAfterDelay(t, () -> {
			check(helper, !Game.isDown(blue) && !blue.isDown(), "the tagged bot did not come back");
			check(helper, blue.position().distanceTo(helper.absoluteVec(new Vec3(30.5, 2, 2.5))) < 1.5, "the tagged bot did not come back on its spawn pad: " + blue.position());
			check(helper, Game.isProtected(blue) && Game.tag(red, blue) == null, "a bot just back could be tagged");
		});
		t += protect + 5;
		helper.runAfterDelay(t, () -> {
			Vec3 b = helper.absoluteVec(new Vec3(14.5, 1, 38.5));
			Vec3 r = helper.absoluteVec(new Vec3(10.5, 1, 38.5));
			blue.teleportTo(b.x, b.y, b.z);
			red.teleportTo(r.x, r.y, r.z);
			for (int y = 1; y <= 3; y++) helper.setBlock(new BlockPos(12, y, 38), Blocks.STONE);
		});
		t += 5;
		helper.runAfterDelay(t, () -> {
			check(helper, Lasers.fireRay(red, red.getEyePosition(), aim(red, blue), 20) == null && !Game.isDown(blue), "a laser went through a wall");
			Game.givePowerup(blue, "shield");
			check(helper, "shield".equals(Game.tag(red, blue)) && !Game.isDown(blue), "the shield did not take the hit");
			check(helper, Lasers.pulse(level, blue.position(), red) == 1 && Game.isDown(blue), "the pulse grenade did not tag");
		});
		t += down + protect + 10;

		// Team deathmatch with a bot on each team that fires by itself.
		helper.runAfterDelay(t, () -> {
			check(helper, Game.start(level, console, "team_deathmatch", 3, 0, 2, 1, null), "the game did not start");
			for (Entity e : level.getAllEntities()) if (e instanceof LaserBot b && b.entityTags().contains(Game.GAME_BOT_TAG)) gameBots.add(b);
			check(helper, gameBots.size() == 2, gameBots.size() + " game bots, not 2");
			// Held still until the test's own tag has scored, so they can't tag the test's bots first.
			gameBots.forEach(b -> b.setHold(true));
			check(helper, Game.current().phase.equals("countdown") && Game.tag(red, blue) == null, "a tag counted during the countdown");
		});
		t += 110;
		helper.runAfterDelay(t, () -> {
			check(helper, Game.running(), "the game did not start after the countdown");
			Vec3 b = helper.absoluteVec(new Vec3(14.5, 1, 34.5));
			Vec3 r = helper.absoluteVec(new Vec3(10.5, 1, 34.5));
			blue.teleportTo(b.x, b.y, b.z);
			red.teleportTo(r.x, r.y, r.z);
			// The game's bots may already have scored: the tag must add one.
			int before = Game.current().scores.get("red");
			check(helper, "tagged".equals(Game.tag(red, blue)) && Game.current().scores.get("red") == before + 1, "the tag did not score: " + Game.current().scores);
			Vec3 g0 = helper.absoluteVec(new Vec3(12.5, 1, 6.5));
			Vec3 g1 = helper.absoluteVec(new Vec3(22.5, 1, 6.5));
			gameBots.get(0).teleportTo(g0.x, g0.y, g0.z);
			gameBots.get(1).teleportTo(g1.x, g1.y, g1.z);
			gameBots.forEach(bot -> bot.setHold(false));
		});
		t += 400;
		helper.runAfterDelay(t, () -> {
			int shots = 0;
			for (LaserBot b : gameBots) {
				GameLogic.Stat s = Game.current().stats.get(Game.nameOf(b));
				if (s != null) shots += s.shots;
			}
			check(helper, shots > 0, "the game's bots never fired");
			check(helper, Game.stop() && Game.current().phase.equals("over"), "the game did not stop");
		});
		t += down + protect;

		// Capture the flag: red takes blue's flag, drops it when tagged, blue sends it home; then red captures it.
		helper.runAfterDelay(t, () -> {
			check(helper, Game.start(level, console, "capture_the_flag", 3, 0, 2, 0, null), "capture the flag did not start");
			check(helper, gameBots.stream().noneMatch(Entity::isAlive), "the last game's bots are still there");
		});
		t += 110;
		helper.runAfterDelay(t, () -> {
			Vec3 stand = helper.absoluteVec(new Vec3(30.5, 2, 10.5));
			red.teleportTo(stand.x, stand.y, stand.z);
		});
		t += 15;
		helper.runAfterDelay(t, () -> {
			GameLogic.Flag f = Game.current().flags.get("blue");
			check(helper, f.state.equals("carried") && Game.nameOf(red).equals(f.carrier), "red did not take the blue flag: " + f.state);
			check(helper, !helper.getBlockState(new BlockPos(30, 1, 10)).getValue(FlagStandBlock.FLAG), "the blue flag is still on its stand");
			check(helper, "tagged".equals(Game.tag(blue, red)) && Game.current().flags.get("blue").state.equals("dropped"), "the flag was not dropped");
			double[] pos = Game.current().flags.get("blue").pos;
			System.arraycopy(pos, 0, drop, 0, 3);
			blue.teleportTo(drop[0], drop[1], drop[2]);
		});
		t += 15;
		helper.runAfterDelay(t, () -> check(helper, Game.current().flags.get("blue").state.equals("home"), "blue did not send its flag home"));
		t += down + protect + 10;
		helper.runAfterDelay(t, () -> {
			Vec3 away = helper.absoluteVec(new Vec3(20.5, 1, 36.5));
			blue.teleportTo(away.x, away.y, away.z);
			Vec3 stand = helper.absoluteVec(new Vec3(30.5, 2, 10.5));
			red.teleportTo(stand.x, stand.y, stand.z);
		});
		t += 15;
		helper.runAfterDelay(t, () -> {
			check(helper, Game.current().flags.get("blue").state.equals("carried"), "red did not take the blue flag again");
			Vec3 home = helper.absoluteVec(new Vec3(2.5, 2, 10.5));
			red.teleportTo(home.x, home.y, home.z);
		});
		t += 15;
		helper.runAfterDelay(t, () -> {
			check(helper, Game.current().scores.get("red") == 1 && Game.current().flags.get("blue").state.equals("home"), "the flag was not captured: " + Game.current().scores);
			check(helper, helper.getBlockState(new BlockPos(30, 1, 10)).getValue(FlagStandBlock.FLAG), "the blue flag is not back on its stand");
			Game.stop();
		});
		t += 5;

		// King of the hill: red stands at the control point until it is red's.
		helper.runAfterDelay(t, () -> check(helper, Game.start(level, console, "king_of_the_hill", 3, 0, 2, 0, null), "king of the hill did not start"));
		t += 110;
		helper.runAfterDelay(t, () -> {
			Vec3 p = helper.absoluteVec(new Vec3(17.5, 1, 21.5));
			red.teleportTo(p.x, p.y, p.z);
		});
		t += (LaserData.rules().point().capture() + 3) * 20;
		helper.runAfterDelay(t, () -> check(helper, Game.current().points.values().stream().anyMatch(p -> "red".equals(p.owner)), "red did not take the control point"));
		t += 50;
		helper.runAfterDelay(t, () -> {
			check(helper, Game.current().scores.get("red") > 0, "holding the point did not score");
			check(helper, helper.getBlockState(new BlockPos(16, 1, 20)).getValue(ControlPointBlock.OWNER) == 1, "the control point does not show red");
			Game.stop();
			Vec3 r = helper.absoluteVec(new Vec3(10.5, 1, 34.5));
			Vec3 b = helper.absoluteVec(new Vec3(14.5, 1, 34.5));
			red.teleportTo(r.x, r.y, r.z);
			blue.teleportTo(b.x, b.y, b.z);
		});
		t += 5;

		// A game ends at its score limit, and is cleared away a little later.
		helper.runAfterDelay(t, () -> check(helper, Game.start(level, console, "team_deathmatch", 3, 1, 2, 0, null), "the last game did not start"));
		t += 110;
		helper.runAfterDelay(t, () -> check(helper, "tagged".equals(Game.tag(red, blue)) && Game.current().phase.equals("over"), "the game did not end at its score limit"));
		t += 230;
		helper.runAfterDelay(t, () -> {
			check(helper, Game.current() == null, "the finished game was not cleared away");
			check(helper, level.getServer().getScoreboard().getObjective("lasertag") == null, "the scoreboard is still up");
			helper.succeed();
		});
	}
}
