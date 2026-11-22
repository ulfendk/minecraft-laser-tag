package dk.ulfen.lasertag.game;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.Gson;
import com.mojang.serialization.Codec;

import dk.ulfen.lasertag.LaserData;
import dk.ulfen.lasertag.LaserRegistry;
import dk.ulfen.lasertag.block.ArenaBlock;
import dk.ulfen.lasertag.block.ControlPointBlock;
import dk.ulfen.lasertag.block.FlagStandBlock;
import dk.ulfen.lasertag.block.PowerStationBlock;
import dk.ulfen.lasertag.block.SirenBlock;
import dk.ulfen.lasertag.block.SmokeMachineBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.core.particles.ColorParticleOption;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.saveddata.SavedData;
import net.minecraft.world.level.saveddata.SavedDataType;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * The arena's game blocks, as they tick: spawn pads (where teams start and come back),
 * flag stands (take the flag, bring it home), control points (who stands next to
 * them), power-up stations (walk on while it glows), smoke machines (haze in
 * bursts) and sirens (shot with a laser: lights out and a strobe). The twin of scripts/arena.js.
 */
public final class Arena {
	private record Entry(String kind, @Nullable String team, ResourceKey<Level> dim, BlockPos pos, long seen) {}

	private static final Map<String, Entry> BLOCKS = new LinkedHashMap<>();
	private static final Map<String, Long> RECHARGE_AT = new HashMap<>();

	private Arena() {}

	// Spawn pads are kept with the world too: a pad far away (whose chunk hasn't ticked
	// since the server started) is still a team's base.
	private record SavedPad(String dim, int x, int y, int z, String team) {}

	public static final class Pads extends SavedData {
		private static final Codec<Pads> CODEC = Codec.STRING.xmap(Pads::new, s -> s.json);
		static final SavedDataType<Pads> TYPE = new SavedDataType<>(LaserRegistry.id("pads"), Pads::new, CODEC, null);
		private String json = "[]";

		public Pads() {}

		private Pads(String json) {
			this.json = json;
		}
	}

	private static final Gson GSON = new Gson();

	private static void savePads(MinecraftServer server) {
		List<SavedPad> pads = new ArrayList<>();
		for (Entry e : BLOCKS.values()) {
			if (e.kind().equals("pad")) pads.add(new SavedPad(e.dim().identifier().toString(), e.pos().getX(), e.pos().getY(), e.pos().getZ(), e.team()));
		}
		Pads s = server.overworld().getDataStorage().computeIfAbsent(Pads.TYPE);
		s.json = GSON.toJson(pads);
		s.setDirty();
	}

	/** The server started: the pads it knew before. */
	public static void load(MinecraftServer server) {
		BLOCKS.clear();
		RECHARGE_AT.clear();
		alarm = null;
		try {
			SavedPad[] pads = GSON.fromJson(server.overworld().getDataStorage().computeIfAbsent(Pads.TYPE).json, SavedPad[].class);
			for (SavedPad p : pads) {
				ResourceKey<Level> dim = ResourceKey.create(Registries.DIMENSION, Identifier.parse(p.dim()));
				BlockPos pos = new BlockPos(p.x(), p.y(), p.z());
				BLOCKS.put(dim.identifier() + " " + p.x() + " " + p.y() + " " + p.z(), new Entry("pad", p.team(), dim, pos, 0));
			}
		} catch (RuntimeException e) {
			// Nothing saved, or unreadable: the pads tell us again as they tick.
		}
	}

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
				if (v.kind().equals("pad")) savePads(level.getServer());
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

	/** A new game: every flag on its stand, every point free, every station and siren charged. */
	public static void reset(MinecraftServer server) {
		RECHARGE_AT.clear();
		for (Entry e : BLOCKS.values()) {
			ServerLevel level = server.getLevel(e.dim());
			if (level == null || !level.isLoaded(e.pos())) continue;
			BlockState state = level.getBlockState(e.pos());
			if (state.hasProperty(FlagStandBlock.FLAG)) state = state.setValue(FlagStandBlock.FLAG, true);
			if (state.hasProperty(ControlPointBlock.OWNER)) state = state.setValue(ControlPointBlock.OWNER, 0);
			if (state.hasProperty(PowerStationBlock.CHARGED)) state = state.setValue(PowerStationBlock.CHARGED, true);
			if (state.hasProperty(SirenBlock.CHARGED)) state = state.setValue(SirenBlock.CHARGED, true);
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
		boolean known = BLOCKS.containsKey(key);
		BLOCKS.put(key, new Entry(block.kind(), block.team(), level.dimension(), pos.immutable(), now));
		if (block.kind().equals("pad") && !known) savePads(level.getServer());
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
			case "smoke" -> {
				if (!state.getValue(SmokeMachineBlock.ON) || !smoking(now)) return;
				int cycle = Math.round((R().smoke().burst() + R().smoke().pause()) * 20);
				if (now % cycle < 10) level.playSound(null, pos, SoundEvents.FIRE_EXTINGUISH, SoundSource.BLOCKS, 0.4F, 0.6F);
				// Big, soft campfire puffs, pushed out sideways so they hang over the arena.
				var random = level.getRandom();
				for (int i = 0; i < R().smoke().puffs(); i++) {
					double a = random.nextDouble() * Math.PI * 2;
					double v = R().smoke().drift() * (0.5 + random.nextDouble() * 0.5);
					level.sendParticles(ParticleTypes.CAMPFIRE_COSY_SMOKE, top.x, top.y + 0.2, top.z, 0, Math.cos(a) * v, 0.01, Math.sin(a) * v, 1.0);
				}
			}
			case "siren" -> {
				if (!state.getValue(SirenBlock.CHARGED) && RECHARGE_AT.getOrDefault(key, 0L) <= now && !alarming()) set(level, pos, state, state.setValue(SirenBlock.CHARGED, true));
			}
			default -> {}
		}
	}

	// ---------------------------------------------------------------- the siren

	/** The siren going off now. */
	private record Alarm(ResourceKey<Level> dim, BlockPos pos, long start, long until) {}

	private static @Nullable Alarm alarm;

	public static boolean alarming() {
		return alarm != null;
	}

	private static List<ServerPlayer> inReach(ServerLevel level, BlockPos pos) {
		double r = R().siren().radius();
		return level.getPlayers(p -> p.distanceToSqr(Vec3.atCenterOf(pos)) <= r * r);
	}

	/** A laser hit the block at `pos`: a charged siren goes off. True if it did. */
	public static boolean soundSiren(ServerLevel level, BlockPos pos) {
		BlockState state = level.getBlockState(pos);
		if (!state.hasProperty(SirenBlock.CHARGED) || !state.getValue(SirenBlock.CHARGED) || alarming()) return false;
		long now = level.getServer().getTickCount();
		int ticks = R().siren().seconds() * 20;
		level.setBlockAndUpdate(pos, state.setValue(SirenBlock.CHARGED, false));
		RECHARGE_AT.put(key(level, pos), now + R().siren().recharge() * 20L);
		alarm = new Alarm(level.dimension(), pos.immutable(), now, now + ticks);
		for (ServerPlayer p : inReach(level, pos)) {
			// The lights go out.
			p.addEffect(new MobEffectInstance(MobEffects.DARKNESS, ticks + 20, 0, false, false));
			p.sendOverlayMessage(net.minecraft.network.chat.Component.translatable("lasertag.siren"));
		}
		return true;
	}

	/** Every server tick: the wail and the strobe of a siren going off, and lights on again after. */
	public static void tickAlarm(MinecraftServer server) {
		Alarm a = alarm;
		if (a == null) return;
		ServerLevel level = server.getLevel(a.dim());
		long now = server.getTickCount();
		if (level == null || now >= a.until()) {
			alarm = null;
			if (level != null) for (ServerPlayer p : inReach(level, a.pos())) {
				p.removeEffect(MobEffects.DARKNESS);
				p.removeEffect(MobEffects.NIGHT_VISION);
			}
			return;
		}
		long t = now - a.start();
		// The wail, twice over.
		if (t % 100 == 0) level.playSound(null, a.pos(), SoundEvents.RAID_HORN.value(), SoundSource.BLOCKS, 4.0F, 1.0F);
		// The strobe: a flash of light every few ticks, for a tick or two.
		if (t % R().siren().flash() != 0) return;
		Vec3 lamp = Vec3.atCenterOf(a.pos()).add(0, 0.8, 0);
		for (ServerPlayer p : inReach(level, a.pos())) {
			p.addEffect(new MobEffectInstance(MobEffects.NIGHT_VISION, 2, 0, false, false));
		}
		level.sendParticles(ColorParticleOption.create(ParticleTypes.FLASH, (t / R().siren().flash()) % 2 == 0 ? 0xFFFF2020 : 0xFFFFFFFF), lamp.x, lamp.y, lamp.z, 1, 0, 0, 0, 0);
	}

	/** Is it time for haze? All machines pump together: a burst, then a rest. */
	public static boolean smoking(long tick) {
		int cycle = Math.round((R().smoke().burst() + R().smoke().pause()) * 20);
		return tick % cycle < R().smoke().burst() * 20;
	}

	/** Switch a smoke machine on or off; true when it is now on. */
	public static boolean toggleSmoke(ServerLevel level, BlockPos pos) {
		BlockState state = level.getBlockState(pos);
		if (!state.hasProperty(SmokeMachineBlock.ON)) return false;
		boolean on = !state.getValue(SmokeMachineBlock.ON);
		level.setBlock(pos, state.setValue(SmokeMachineBlock.ON, on), 3);
		level.playSound(null, pos, SoundEvents.UI_BUTTON_CLICK.value(), SoundSource.BLOCKS, 0.4F, on ? 1.2F : 0.8F);
		return on;
	}
}
