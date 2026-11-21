package dk.ulfen.lasertag;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.reflect.TypeToken;

/**
 * The numbers shared with the Bedrock add-on, generated from src/rules.mjs and
 * src/creatures.mjs into data/lasertag/{rules,creatures}.json by tools/java.mjs.
 * Field names match the JSON.
 */
public final class LaserData {
	public record Rules(List<String> teams, Map<String, Colour> colours, Map<String, Gun> guns, Heat heat, Grenade grenade, Tag tag,
		List<List<Object>> streaks, List<List<Object>> multis, Map<String, Mode> modes, Console console, Flag flag, Point point,
		Powerups powerups, Smoke smoke, Bot bot) {}

	/** `rgb` 0–255, and the chat colour code. */
	public record Colour(int[] rgb, String chat) {
		public int packed() {
			return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
		}
	}

	/** A laser gun: `range` in blocks, `cooldown` seconds between shots, `heat` per shot, `spread` in degrees. */
	public record Gun(float range, float cooldown, float heat, int rays, float spread, int points, boolean zoom) {}

	public record Heat(float max, float coolPerSecond, float overheatCoolPerSecond) {}

	public record Grenade(String id, float radius, float fuse) {}

	public record Tag(float down, float protect, int multiWindow) {}

	public record Mode(boolean teams, int scoreLimit) {}

	public record Console(List<Integer> minutes, int startMinutes, int botsPerTeam, int countdown, float reach, int warnAt) {}

	public record Flag(float touch, int returnAfter) {}

	public record Point(float radius, int capture, int maxPush, int decay) {}

	public record Powerups(int recharge, float touch, Map<String, Kind> kinds) {}

	public record Kind(int seconds) {}

	public record Smoke(float burst, float pause, int puffs, float drift) {}

	public record Bot(float health, float sight, float[] interval, float accuracy, float range) {}

	public record Creature(String id, float width, float height, double health, double speed, List<String> animations, Sounds sounds) {}

	public record Sounds(String ambient, String hurt, String death, String step, float pitchMin, float pitchMax) {}

	private static Rules rules;
	private static Map<String, Creature> creatures;

	private LaserData() {}

	private static <T> T read(String file, Type type) {
		try (InputStream in = LaserData.class.getResourceAsStream("/data/lasertag/" + file)) {
			if (in == null) throw new IllegalStateException(file + " missing from the mod jar (run `npm run build`)");
			return new Gson().fromJson(new InputStreamReader(in, StandardCharsets.UTF_8), type);
		} catch (IOException e) {
			throw new IllegalStateException("Could not read " + file, e);
		}
	}

	public static Rules rules() {
		if (rules == null) rules = read("rules.json", Rules.class);
		return rules;
	}

	public static Creature creature(String id) {
		if (creatures == null) {
			List<Creature> list = read("creatures.json", new TypeToken<List<Creature>>() {}.getType());
			creatures = new java.util.HashMap<>();
			for (Creature c : list) creatures.put(c.id(), c);
		}
		Creature c = creatures.get(id);
		if (c == null) throw new IllegalArgumentException("No creature " + id + " in creatures.json");
		return c;
	}

	/** Games played with the JavaScript rules, for the game test that replays them (tools/fixtures.mjs). */
	public static JsonElement fixtures() {
		return read("fixtures.json", JsonElement.class);
	}
}
