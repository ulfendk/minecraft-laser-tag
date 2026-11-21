package dk.ulfen.lasertag.game;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import dk.ulfen.lasertag.LaserData;
import dk.ulfen.lasertag.block.ArenaBlock;
import dk.ulfen.lasertag.block.ControlPointBlock;
import dk.ulfen.lasertag.block.FlagStandBlock;
import dk.ulfen.lasertag.block.PowerStationBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * The arena's game blocks, as they tick: spawn pads (where teams start and come back),
 * flag stands (take the flag, bring it home), control points (who stands next to
 * them) and power-up stations (walk on while it glows). The twin of scripts/arena.js.
 */
public final class Arena {
	private record Entry(String kind, @Nullable String team, ResourceKey<Level> dim, BlockPos pos, long seen) {}

	private static final Map<String, Entry> BLOCKS = new LinkedHashMap<>();
	private static final Map<String, Long> RECHARGE_AT = new HashMap<>();

	private Arena() {}

	public static String key(Level level, BlockPos pos) {
		return level.dimension().identifier() + " " + pos.getX() + " " + pos.getY() + " " + pos.getZ();
	}

	public static void forget(Level level, BlockPos pos) {
		BLOCKS.remove(key(level, pos));
	}

	private static LaserData.Rules R() {
		return LaserData.rules();
	}

	/** Entries of one kind in `level` whose block is still there. */
	private static List<Map.Entry<String, Entry>> entries(String kind, ServerLevel level, @Nullable String team) {
		List<Map.Entry<String, Entry>> out = new ArrayList<>();
		var it = BLOCKS.entrySet().iterator();
		while (it.hasNext()) {
			var e = it.next();
			Entry v = e.getValue();
			if (!v.kind().equals(kind) || v.dim() != level.dimension() || (team != null && !team.equals(v.team()))) continue;
			if (level.isLoaded(v.pos()) && !(level.getBlockState(v.pos()).getBlock() instanceof ArenaBlock)) {
				it.remove();
				continue;
			}
			out.add(e);
		}
		return out;
	}

	public static List<BlockPos> padsOf(String team, ServerLevel level) {
		return entries("pad", level, team).stream().map(e -> e.getValue().pos()).toList();
	}

	/** For each control point: how many active players and bots of each team are next to it. */
	public static Map<String, Map<String, Integer>> pointCounts(ServerLevel level) {
		Map<String, Map<String, Integer>> out = new LinkedHashMap<>();
		long now = level.getServer().getTickCount();
		for (var e : entries("point", level, null)) {
			if (now - e.getValue().seen() > 60) continue;
			Map<String, Integer> counts = new LinkedHashMap<>();
			Vec3 at = Vec3.atBottomCenterOf(e.getValue().pos()).add(0, 1, 0);
			for (Entity ent : near(level, at, R().point().radius())) {
				counts.merge(Game.teamOf(ent), 1, Integer::sum);
			}
			out.put(e.getKey(), counts);
		}
		return out;
	}

	/** Active players and bots within `reach` of `at`. */
	private static List<Entity> near(ServerLevel level, Vec3 at, double reach) {
		return level.getEntities((Entity) null, new AABB(at, at).inflate(reach), x -> Game.isActive(x) && x.position().distanceTo(at) <= reach);
	}

	/** Show or hide a team's flag on its stands. */
	public static void showFlag(MinecraftServer server, String team, boolean shown) {
		for (Entry e : BLOCKS.values()) {
			if (!e.kind().equals("flag") || !team.equals(e.team())) continue;
			ServerLevel level = server.getLevel(e.dim());
			if (level == null || !level.isLoaded(e.pos())) continue;
			BlockState state = level.getBlockState(e.pos());
			if (state.hasProperty(FlagStandBlock.FLAG) && state.getValue(FlagStandBlock.FLAG) != shown) level.setBlockAndUpdate(e.pos(), state.setValue(FlagStandBlock.FLAG, shown));
		}
	}

	/** A new game: every flag on its stand, every point free, every station charged. */
	public static void reset(MinecraftServer server) {
		RECHARGE_AT.clear();
		for (Entry e : BLOCKS.values()) {
			ServerLevel level = server.getLevel(e.dim());
			if (level == null || !level.isLoaded(e.pos())) continue;
			BlockState state = level.getBlockState(e.pos());
			if (state.hasProperty(FlagStandBlock.FLAG)) state = state.setValue(FlagStandBlock.FLAG, true);
			if (state.hasProperty(ControlPointBlock.OWNER)) state = state.setValue(ControlPointBlock.OWNER, 0);
			if (state.hasProperty(PowerStationBlock.CHARGED)) state = state.setValue(PowerStationBlock.CHARGED, true);
			level.setBlockAndUpdate(e.pos(), state);
		}
	}

	private static void ring(ServerLevel level, BlockPos pos, @Nullable String team, double radius, int n) {
		int colour = team == null ? 0xEBF0FF : R().colours().get(team).packed();
		DustParticleOptions dust = new DustParticleOptions(colour, 0.7F);
		double phase = (level.getServer().getTickCount() / 20.0) % (Math.PI * 2);
		for (int i = 0; i < n; i++) {
			double a = phase + i * Math.PI * 2 / n;
			level.sendParticles(dust, pos.getX() + 0.5 + Math.cos(a) * radius, pos.getY() + 1.05, pos.getZ() + 0.5 + Math.sin(a) * radius, 1, 0, 0, 0, 0);
		}
	}

	private static void set(ServerLevel level, BlockPos pos, BlockState state, BlockState next) {
		if (next != state) level.setBlockAndUpdate(pos, next);
	}

	/** A game block ticked: remember it, and do what it does. */
	public static void tick(ServerLevel level, BlockPos pos, BlockState state, ArenaBlock block) {
		String key = key(level, pos);
		long now = level.getServer().getTickCount();
		BLOCKS.put(key, new Entry(block.kind(), block.team(), level.dimension(), pos.immutable(), now));
		GameLogic.State game = Game.current();
		Vec3 top = Vec3.atBottomCenterOf(pos).add(0, 1, 0);
		switch (block.kind()) {
			case "pad" -> ring(level, pos, block.team(), 0.45, 4);
			case "flag" -> {
				boolean ctf = game != null && game.mode.equals("capture_the_flag") && !game.phase.equals("over") && game.flags.containsKey(block.team());
				boolean shown = !ctf || game.flags.get(block.team()).state.equals("home");
				set(level, pos, state, state.setValue(FlagStandBlock.FLAG, shown));
				if (!ctf || !game.phase.equals("running")) return;
				for (Entity e : near(level, top, R().flag().touch())) {
					List<GameLogic.Event> events = GameLogic.touchStand(game, Game.nameOf(e), Game.teamOf(e), block.team());
					if (!events.isEmpty()) Game.handle(level.getServer(), events);
				}
			}
			case "point" -> {
				GameLogic.Point point = game != null && game.mode.equals("king_of_the_hill") ? game.points.get(key) : null;
				int owner = point != null && point.owner != null ? R().teams().indexOf(point.owner) + 1 : 0;
				set(level, pos, state, state.setValue(ControlPointBlock.OWNER, owner));
				ring(level, pos, point == null ? null : point.owner != null ? point.owner : point.team, R().point().radius(), 16);
				if (point != null && point.team != null && point.owner == null && point.progress > 0) {
					for (Entity e : near(level, top, R().point().radius())) {
						if (e instanceof ServerPlayer p && point.team.equals(Game.teamOf(p))) {
							p.sendOverlayMessage(net.minecraft.network.chat.Component.translatable("lasertag.hud.capturing", String.valueOf(point.progress), String.valueOf(R().point().capture())));
						}
					}
				}
			}
			case "station" -> {
				if (!state.getValue(PowerStationBlock.CHARGED)) {
					if (RECHARGE_AT.getOrDefault(key, 0L) <= now) set(level, pos, state, state.setValue(PowerStationBlock.CHARGED, true));
					return;
				}
				ring(level, pos, null, 0.4, 3);
				for (Entity e : near(level, top, R().powerups().touch())) {
					if (!(e instanceof ServerPlayer p)) continue;
					Game.givePowerup(p, GameLogic.pickPowerup(level.getRandom().nextDouble()));
					set(level, pos, state, state.setValue(PowerStationBlock.CHARGED, false));
					RECHARGE_AT.put(key, now + R().powerups().recharge() * 20L);
					break;
				}
			}
			default -> {}
		}
	}
}
