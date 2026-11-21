package dk.ulfen.lasertag.game;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.google.gson.Gson;
import com.mojang.serialization.Codec;

import dk.ulfen.lasertag.LaserData;
import dk.ulfen.lasertag.LaserRegistry;
import dk.ulfen.lasertag.entity.LaserBot;
import dk.ulfen.lasertag.item.VestItem;
import it.unimi.dsi.fastutil.ints.IntList;
import com.mojang.math.Transformation;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Display;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.FireworkRocketEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.FireworkExplosion;
import net.minecraft.world.item.component.Fireworks;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.saveddata.SavedData;
import net.minecraft.world.level.saveddata.SavedDataType;
import net.minecraft.world.scores.DisplaySlot;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.ScoreHolder;
import net.minecraft.world.scores.Scoreboard;
import net.minecraft.world.scores.criteria.ObjectiveCriteria;
import org.joml.Vector3f;
import org.jspecify.annotations.Nullable;

/**
 * The game itself: who is tagged and when they are back, heat and power-ups, the round
 * (GameLogic) with its countdown, scores on the sidebar, the HUD above the hotbar, and
 * the end with fireworks and stats. The twin of scripts/game.js.
 */
public final class Game {
	public static final String DOWN_TAG = "lasertag_down";
	public static final String SIGN_TAG = "lasertag_sign";
	private static final Map<UUID, Display.TextDisplay> SIGNS = new HashMap<>();
	public static final String GAME_BOT_TAG = "lasertag_game_bot";
	private static final String OBJECTIVE = "lasertag";
	private static final Gson GSON = new Gson();

	private static GameLogic.@Nullable State game;
	private static @Nullable MinecraftServer server;
	private static final Map<UUID, Long> DOWN_UNTIL = new HashMap<>();
	private static final Map<UUID, Long> PROTECT_UNTIL = new HashMap<>();
	private static final Map<UUID, Map<String, Long>> POWERUPS = new HashMap<>();
	private static final Map<UUID, GameLogic.Heat> HEAT = new HashMap<>();
	private static final Map<UUID, Long> MESSAGE_UNTIL = new HashMap<>();
	private static long clearAt;

	private Game() {}

	private static LaserData.Rules R() {
		return LaserData.rules();
	}

	public static GameLogic.@Nullable State current() {
		return game;
	}

	public static boolean running() {
		return game != null && game.phase.equals("running");
	}

	private static long now() {
		return server == null ? 0 : server.getTickCount();
	}

	// ---------------------------------------------------------------- who is who

	/** The team an entity plays for: a player's vest, a bot's colour; null for anyone else. */
	public static @Nullable String teamOf(@Nullable Entity e) {
		if (e instanceof Player p && p.getItemBySlot(EquipmentSlot.CHEST).getItem() instanceof VestItem vest) return vest.team();
		if (e instanceof LaserBot bot) return bot.team();
		return null;
	}

	public static String nameOf(Entity e) {
		if (e instanceof Player p) return p.getGameProfile().name();
		return e.hasCustomName() ? e.getCustomName().getString() : "Bot " + e.getId();
	}

	public static ChatFormatting colour(@Nullable String team) {
		ChatFormatting f = team == null ? null : ChatFormatting.getByCode(R().colours().get(team).chat().charAt(0));
		return f == null ? ChatFormatting.WHITE : f;
	}

	public static MutableComponent coloured(Entity e) {
		return Component.literal(nameOf(e)).withStyle(colour(teamOf(e)));
	}

	public static MutableComponent teamText(String team) {
		return Component.translatable("lasertag.team." + team).withStyle(colour(team));
	}

	private static MutableComponent flagText(String team) {
		return Component.translatable("lasertag.flag." + team).withStyle(colour(team));
	}

	public static boolean isDown(Entity e) {
		return DOWN_UNTIL.getOrDefault(e.getUUID(), 0L) > now();
	}

	public static boolean isProtected(Entity e) {
		return PROTECT_UNTIL.getOrDefault(e.getUUID(), 0L) > now();
	}

	public static boolean isActive(Entity e) {
		return e.isAlive() && teamOf(e) != null && !isDown(e);
	}

	public static boolean hasPowerup(Entity e, String kind) {
		return POWERUPS.getOrDefault(e.getUUID(), Map.of()).getOrDefault(kind, 0L) > now();
	}

	public static GameLogic.Heat heatOf(Entity e) {
		return HEAT.getOrDefault(e.getUUID(), new GameLogic.Heat(0, false));
	}

	public static void setHeat(Entity e, GameLogic.Heat h) {
		HEAT.put(e.getUUID(), h);
	}

	/** Whether `bot` should go after `target`: in another team's colours, in and not just back. */
	public static boolean isEnemyTarget(LaserBot bot, LivingEntity target) {
		String t = teamOf(target);
		return t != null && !t.equals(bot.team()) && isActive(target) && !isProtected(target) && !(target instanceof Player p && (p.isSpectator() || p.isCreative()));
	}

	/** Something to show above a player's hotbar for a moment, instead of the HUD. */
	public static void flash(Entity e, String key, Object... args) {
		if (!(e instanceof ServerPlayer p)) return;
		MESSAGE_UNTIL.put(p.getUUID(), now() + 30);
		p.sendOverlayMessage(Component.translatable("lasertag." + key, args));
	}

	public static @Nullable String cannotFire(Entity e) {
		if (teamOf(e) == null) return "hud.no_vest";
		if (isDown(e)) return "down";
		if (game != null && game.phase.equals("countdown")) return "hud.not_yet";
		return null;
	}

	public static void recordShot(Entity shooter, int hits) {
		GameLogic.onShot(game, nameOf(shooter), hits);
	}

	private static void sound(Entity e, SoundEvent s, float pitch) {
		e.level().playSound(null, e.getX(), e.getY(), e.getZ(), s, SoundSource.PLAYERS, 1.0F, pitch);
	}

	private static void broadcast(Component c) {
		if (server != null) server.getPlayerList().broadcastSystemMessage(c, false);
	}

	public static void title(ServerPlayer p, Component text, Component subtitle, int stay) {
		p.connection.send(new ClientboundSetTitlesAnimationPacket(2, stay, 6));
		p.connection.send(new ClientboundSetSubtitleTextPacket(subtitle));
		p.connection.send(new ClientboundSetTitleTextPacket(text));
	}

	// ---------------------------------------------------------------- tags

	/** `shooter` tags `target`. Returns "tagged", "shield" or null (not a tag). */
	public static @Nullable String tag(LivingEntity shooter, Entity target) {
		String ts = teamOf(shooter);
		String tt = teamOf(target);
		if (ts == null || tt == null || !target.isAlive() || isDown(target) || isProtected(target)) return null;
		if (game != null && !game.phase.equals("running")) return null;
		if (!GameLogic.enemies(game, nameOf(shooter), ts, nameOf(target), tt)) return null;
		ServerLevel level = (ServerLevel) target.level();
		Lasers.sparks(level, target, tt);
		if (hasPowerup(target, "shield")) {
			POWERUPS.get(target.getUUID()).remove("shield");
			sound(target, SoundEvents.AMETHYST_CLUSTER_BREAK, 1.2F);
			flash(target, "hud.shield_hit");
			return "shield";
		}
		double[] pos = {target.getX(), target.getY(), target.getZ()};
		goDown(target, shooter);
		flash(shooter, "hud.you_tagged", coloured(target));
		if (shooter instanceof ServerPlayer p) p.level().playSound(null, p.blockPosition(), SoundEvents.EXPERIENCE_ORB_PICKUP, SoundSource.PLAYERS, 0.6F, 1.6F);
		if (game != null) {
			broadcast(Component.translatable("lasertag.feed", coloured(shooter), coloured(target)));
			handle(level.getServer(), GameLogic.onTag(game, nameOf(shooter), ts, nameOf(target), tt, pos, hasPowerup(shooter, "double_points")));
			save();
		}
		return "tagged";
	}

	/** Stunned for a while: can't move or fire, with a sign above the head; then back at a spawn pad. */
	private static void goDown(Entity e, Entity by) {
		int ticks = Math.round(R().tag().down() * 20);
		DOWN_UNTIL.put(e.getUUID(), now() + ticks);
		e.addTag(DOWN_TAG);
		sound(e, SoundEvents.BEACON_DEACTIVATE, 1.4F);
		showSign(e, ticks);
		if (e instanceof LivingEntity living) living.addEffect(new MobEffectInstance(MobEffects.GLOWING, ticks, 0, false, false));
		if (e instanceof LaserBot bot) {
			bot.setDown(true);
			return;
		}
		if (e instanceof ServerPlayer p) {
			stun(p, true);
			title(p, Component.translatable("lasertag.title.tagged").withStyle(ChatFormatting.RED), Component.translatable("lasertag.title.by", coloured(by)), ticks - 10);
		}
	}

	private static void comeBack(Entity e) {
		DOWN_UNTIL.remove(e.getUUID());
		wakeUp(e);
		if (e instanceof LaserBot bot) bot.setDown(false);
		respawn(e);
		PROTECT_UNTIL.put(e.getUUID(), now() + Math.round(R().tag().protect() * 20));
		sound(e, SoundEvents.BEACON_ACTIVATE, 1.6F);
	}

	/** No longer tagged: no sign, free to move. */
	private static void wakeUp(Entity e) {
		e.removeTag(DOWN_TAG);
		hideSign(e.getUUID());
		if (e instanceof LivingEntity living) living.removeEffect(MobEffects.GLOWING);
		if (e instanceof ServerPlayer p) stun(p, false);
	}

	/** A player that can't walk or jump. The modifiers are transient: gone after a restart. */
	private static void stun(ServerPlayer p, boolean on) {
		Identifier id = LaserRegistry.id("stun");
		for (var attribute : List.of(Attributes.MOVEMENT_SPEED, Attributes.JUMP_STRENGTH)) {
			var instance = p.getAttribute(attribute);
			if (instance == null) continue;
			if (on) instance.addOrUpdateTransientModifier(new AttributeModifier(id, -1, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
			else instance.removeModifier(id);
		}
	}

	/** The sign above a tagged head: a floating text that follows it and counts down. */
	private static void showSign(Entity e, long ticksLeft) {
		if (!(e.level() instanceof ServerLevel level)) return;
		Display.TextDisplay sign = SIGNS.get(e.getUUID());
		if (sign == null || sign.isRemoved()) {
			sign = EntityTypes.TEXT_DISPLAY.create(level, EntitySpawnReason.TRIGGERED);
			if (sign == null) return;
			sign.addTag(SIGN_TAG);
			sign.setBillboardConstraints(Display.BillboardConstraints.CENTER);
			sign.setBackgroundColor(0xC0400000);
			sign.setTransformation(new Transformation(null, null, new Vector3f(1.5F), null));
			sign.snapTo(e.getX(), e.getY() + e.getBbHeight() + 0.7, e.getZ());
			SIGNS.put(e.getUUID(), sign);
			level.addFreshEntity(sign);
		} else if (sign.distanceToSqr(e.getX(), e.getY() + e.getBbHeight() + 0.7, e.getZ()) > 0.01) {
			sign.teleportTo(e.getX(), e.getY() + e.getBbHeight() + 0.7, e.getZ());
		}
		sign.setText(Component.translatable("lasertag.sign.tagged", String.valueOf((ticksLeft + 19) / 20)).withStyle(ChatFormatting.RED, ChatFormatting.BOLD));
	}

	private static void hideSign(UUID id) {
		Display.TextDisplay sign = SIGNS.remove(id);
		if (sign != null) sign.discard();
	}

	public static Display.@Nullable TextDisplay signOf(Entity e) {
		return SIGNS.get(e.getUUID());
	}

	/** Send `e` to one of its team's spawn pads. */
	public static boolean respawn(Entity e) {
		String team = teamOf(e);
		if (team == null || !(e.level() instanceof ServerLevel level)) return false;
		List<BlockPos> pads = Arena.padsOf(team, level);
		if (pads.isEmpty()) return false;
		BlockPos pad = pads.get(level.getRandom().nextInt(pads.size()));
		e.teleportTo(pad.getX() + 0.5, pad.getY() + 1, pad.getZ() + 0.5);
		return true;
	}

	// ---------------------------------------------------------------- power-ups

	public static void givePowerup(Entity e, String kind) {
		LaserData.Kind k = R().powerups().kinds().get(kind);
		if (k == null) return;
		POWERUPS.computeIfAbsent(e.getUUID(), u -> new HashMap<>()).put(kind, now() + k.seconds() * 20L);
		if (kind.equals("speed") && e instanceof LivingEntity l) l.addEffect(new MobEffectInstance(MobEffects.SPEED, k.seconds() * 20, 1, false, false));
		if (kind.equals("rapid_fire")) HEAT.remove(e.getUUID());
		sound(e, SoundEvents.BEACON_POWER_SELECT, 1.5F);
		flash(e, "powerup." + kind);
	}

	// ---------------------------------------------------------------- the round

	private static ServerLevel gameLevel() {
		ServerLevel level = game != null && game.dim != null ? server.getLevel(ResourceKey.create(Registries.DIMENSION, Identifier.parse(game.dim))) : null;
		return level != null ? level : server.overworld();
	}

	private static List<ServerPlayer> players() {
		return server == null ? List.of() : server.getPlayerList().getPlayers().stream().filter(p -> teamOf(p) != null).toList();
	}

	private static @Nullable Entity findByName(@Nullable String who) {
		if (who == null || server == null) return null;
		ServerPlayer p = server.getPlayerList().getPlayerByName(who);
		if (p != null) return p;
		for (Entity e : gameLevel().getAllEntities()) if (e instanceof LaserBot && nameOf(e).equals(who)) return e;
		return null;
	}

	/** Start a game at the console at `pos`. False if one is on already. */
	public static boolean start(ServerLevel level, BlockPos pos, String mode, int minutes, int scoreLimit, int teams, int bots, @Nullable ServerPlayer starter) {
		if (game != null && !game.phase.equals("over")) return false;
		server = level.getServer();
		game = GameLogic.newGame(mode, minutes, scoreLimit, teams);
		game.dim = level.dimension().identifier().toString();
		game.x = pos.getX();
		game.y = pos.getY();
		game.z = pos.getZ();
		clearAt = 0;
		for (UUID id : DOWN_UNTIL.keySet()) {
			Entity e = findEntity(id);
			if (e != null) wakeUp(e);
		}
		DOWN_UNTIL.clear();
		PROTECT_UNTIL.clear();
		POWERUPS.clear();
		HEAT.clear();
		for (ServerPlayer p : server.getPlayerList().getPlayers()) wakeUp(p);
		setupScoreboard();
		Arena.reset(server);
		removeGameBots(level);
		spawnGameBots(level, pos, bots);
		for (ServerPlayer p : players()) {
			if (p.level() == level && Math.hypot(p.getX() - pos.getX(), p.getZ() - pos.getZ()) <= R().console().reach()) respawn(p);
		}
		broadcast(Component.translatable("lasertag.started", starter != null ? starter.getName() : Component.literal("Laser Tag"),
			Component.translatable("lasertag.mode." + game.mode), String.valueOf(game.left / 60), String.valueOf(game.scoreLimit)));
		showCountdown(game.countdown);
		save();
		return true;
	}

	public static boolean stop() {
		if (game == null || game.phase.equals("over")) return false;
		broadcast(Component.translatable("lasertag.stopped"));
		handle(server, GameLogic.stop(game));
		save();
		return true;
	}

	private static void spawnGameBots(ServerLevel level, BlockPos at, int perTeam) {
		List<String> teams = GameLogic.botTeams(game, perTeam);
		Map<String, Integer> n = new HashMap<>();
		for (int i = 0; i < teams.size(); i++) {
			String team = teams.get(i);
			List<BlockPos> pads = Arena.padsOf(team, level);
			double a = i * Math.PI * 2 / Math.max(1, teams.size());
			BlockPos pad = pads.isEmpty() ? null : pads.get(i % pads.size());
			LaserBot bot = LaserRegistry.LASER_BOT.create(level, EntitySpawnReason.EVENT);
			if (bot == null) continue;
			if (pad != null) bot.setPos(pad.getX() + 0.5, pad.getY() + 1, pad.getZ() + 0.5);
			else bot.setPos(at.getX() + 0.5 + Math.cos(a) * 4, at.getY() + 1, at.getZ() + 0.5 + Math.sin(a) * 4);
			int k = n.merge(team, 1, Integer::sum);
			bot.setTeam(team);
			bot.addTag(GAME_BOT_TAG);
			bot.setCustomName(Component.translatable("lasertag.team." + team).append(" Bot " + k).withStyle(colour(team)));
			bot.setCustomName(Component.literal(teamLabel(team) + " Bot " + k).withStyle(colour(team)));
			bot.setCustomNameVisible(true);
			level.addFreshEntity(bot);
		}
	}

	private static String teamLabel(String team) {
		return Character.toUpperCase(team.charAt(0)) + team.substring(1);
	}

	public static void removeGameBots(ServerLevel level) {
		List<Entity> bots = new ArrayList<>();
		for (Entity e : level.getAllEntities()) if (e instanceof LaserBot && e.entityTags().contains(GAME_BOT_TAG)) bots.add(e);
		bots.forEach(Entity::discard);
	}

	private static void showCountdown(int n) {
		for (ServerPlayer p : players()) {
			title(p, Component.literal(String.valueOf(n)).withStyle(ChatFormatting.YELLOW), Component.translatable("lasertag.title.ready"), 20);
			p.level().playSound(null, p.blockPosition(), SoundEvents.NOTE_BLOCK_PLING.value(), SoundSource.PLAYERS, 1.0F, 1.0F + (R().console().countdown() - n) * 0.1F);
		}
	}

	private static void allSound(SoundEvent s, float volume, float pitch) {
		if (server == null) return;
		for (ServerPlayer p : server.getPlayerList().getPlayers()) p.level().playSound(null, p.blockPosition(), s, SoundSource.PLAYERS, volume, pitch);
	}

	/** Act on what the rules say happened. */
	public static void handle(MinecraftServer srv, List<GameLogic.Event> events) {
		server = srv;
		for (GameLogic.Event e : events) {
			switch (e.type()) {
				case "countdown" -> showCountdown(e.n());
				case "go" -> {
					for (ServerPlayer p : players()) title(p, Component.translatable("lasertag.title.go").withStyle(ChatFormatting.GREEN), Component.empty(), 20);
					allSound(SoundEvents.PLAYER_LEVELUP, 0.8F, 1.4F);
				}
				case "minute" -> broadcast(Component.translatable("lasertag.minute"));
				case "streak" -> {
					Entity who = findByName(e.who());
					broadcast(Component.translatable("lasertag.streak." + e.name(), who != null ? coloured(who) : Component.literal(String.valueOf(e.who()))));
				}
				case "multi" -> {
					if (findByName(e.who()) instanceof ServerPlayer p) title(p, Component.literal(" "), Component.translatable("lasertag.multi." + e.name()).withStyle(ChatFormatting.GOLD), 20);
				}
				case "flag_taken" -> {
					Entity who = findByName(e.who());
					broadcast(Component.translatable("lasertag.flag_taken", who != null ? coloured(who) : Component.literal(String.valueOf(e.who())), flagText(e.flag())));
					Arena.showFlag(srv, e.flag(), false);
					allSound(SoundEvents.BELL_BLOCK, 0.6F, 1.2F);
				}
				case "flag_dropped" -> {
					Entity who = findByName(e.who());
					broadcast(Component.translatable("lasertag.flag_dropped", who != null ? coloured(who) : Component.literal(String.valueOf(e.who())), flagText(e.flag())));
				}
				case "flag_returned" -> {
					broadcast(Component.translatable("lasertag.flag_returned", flagText(e.flag())));
					Arena.showFlag(srv, e.flag(), true);
				}
				case "captured" -> {
					Entity who = findByName(e.who());
					broadcast(Component.translatable("lasertag.captured", who != null ? coloured(who) : Component.literal(String.valueOf(e.who())), flagText(e.flag())));
					Arena.showFlag(srv, e.flag(), true);
					allSound(SoundEvents.TOTEM_USE, 0.5F, 1.0F);
				}
				case "point_taken" -> broadcast(Component.translatable("lasertag.point_taken", teamText(e.team())));
				case "point_lost" -> broadcast(Component.translatable("lasertag.point_lost", teamText(e.team())));
				case "over" -> finish(e.winner());
				default -> {}
			}
		}
	}

	private static void finish(@Nullable String winner) {
		Component winnerText = winner == null ? Component.translatable("lasertag.draw")
			: GameLogic.teamMode(game) ? Component.translatable("lasertag.winner", teamText(winner))
				: Component.translatable("lasertag.winner", Component.literal(winner).withStyle(ChatFormatting.YELLOW));
		for (ServerPlayer p : server.getPlayerList().getPlayers()) title(p, Component.translatable("lasertag.over").withStyle(ChatFormatting.GOLD), winnerText, 80);
		allSound(SoundEvents.PLAYER_LEVELUP, 1.0F, 1.0F);
		broadcast(Component.translatable("lasertag.over"));
		broadcast(winnerText);
		game.stats.entrySet().stream().sorted((a, b) -> b.getValue().tags - a.getValue().tags).forEach(row -> {
			GameLogic.Stat s = row.getValue();
			broadcast(Component.translatable("lasertag.stats", row.getKey(), String.valueOf(s.tags), String.valueOf(s.tagged), GameLogic.accuracy(s) + "%", String.valueOf(s.captures)));
		});
		String best = GameLogic.mvp(game);
		if (best != null) broadcast(Component.translatable("lasertag.mvp", Component.literal(best).withStyle(ChatFormatting.GOLD)));
		fireworks(winner);
		clearAt = now() + 200;
	}

	private static void fireworks(@Nullable String winner) {
		ServerLevel level = gameLevel();
		List<BlockPos> spots = new ArrayList<>(winner != null && R().teams().contains(winner) ? Arena.padsOf(winner, level) : List.of());
		if (spots.isEmpty()) spots.add(BlockPos.containing(game.x, game.y, game.z));
		int colour = winner != null && R().teams().contains(winner) ? R().colours().get(winner).packed() : 0xFFFFFF;
		ItemStack rocket = new ItemStack(Items.FIREWORK_ROCKET);
		rocket.set(DataComponents.FIREWORKS, new Fireworks(1, List.of(new FireworkExplosion(FireworkExplosion.Shape.LARGE_BALL, IntList.of(colour), IntList.of(0xFFFFFF), true, true))));
		for (BlockPos s : spots.subList(0, Math.min(4, spots.size()))) {
			level.addFreshEntity(new FireworkRocketEntity(level, s.getX() + 0.5, s.getY() + 1.5, s.getZ() + 0.5, rocket.copy()));
		}
	}

	// ---------------------------------------------------------------- scoreboard and HUD

	private static void setupScoreboard() {
		Scoreboard board = server.getScoreboard();
		Objective old = board.getObjective(OBJECTIVE);
		if (old != null) board.removeObjective(old);
		Objective obj = board.addObjective(OBJECTIVE, ObjectiveCriteria.DUMMY, Component.translatable("lasertag.scoreboard").withStyle(ChatFormatting.AQUA),
			ObjectiveCriteria.RenderType.INTEGER, true, null);
		board.setDisplayObjective(DisplaySlot.SIDEBAR, obj);
		updateScoreboard();
	}

	private static void updateScoreboard() {
		if (server == null || game == null) return;
		Scoreboard board = server.getScoreboard();
		Objective obj = board.getObjective(OBJECTIVE);
		if (obj == null) return;
		boolean teams = GameLogic.teamMode(game);
		for (var e : game.scores.entrySet()) {
			var score = board.getOrCreatePlayerScore(ScoreHolder.forNameOnly(e.getKey()), obj);
			score.set(e.getValue());
			score.display(teams ? teamText(e.getKey()) : Component.literal(e.getKey()));
		}
	}

	private static void clearScoreboard() {
		if (server == null) return;
		Objective obj = server.getScoreboard().getObjective(OBJECTIVE);
		if (obj != null) server.getScoreboard().removeObjective(obj);
	}

	private static Component hud(ServerPlayer p) {
		if (isDown(p)) return Component.translatable("lasertag.hud.down", String.valueOf((DOWN_UNTIL.get(p.getUUID()) - now() + 19) / 20));
		GameLogic.Heat h = heatOf(p);
		if (h.overheated()) return Component.translatable("lasertag.hud.overheated");
		List<Component> parts = new ArrayList<>();
		if (running()) {
			parts.add(Component.translatable("lasertag.hud.time", GameLogic.clockText(game.left)));
			if (GameLogic.teamMode(game)) {
				MutableComponent scores = Component.empty();
				var top = GameLogic.standings(game);
				for (int i = 0; i < Math.min(4, top.size()); i++) {
					if (i > 0) scores.append(" : ");
					scores.append(Component.literal(String.valueOf(top.get(i).getValue())).withStyle(colour(top.get(i).getKey())));
				}
				parts.add(scores);
			} else parts.add(Component.literal(String.valueOf(game.scores.getOrDefault(nameOf(p), 0))).withStyle(ChatFormatting.YELLOW));
			List<String> flags = GameLogic.carrying(game, nameOf(p));
			if (!flags.isEmpty()) parts.add(Component.translatable("lasertag.hud.carrying", flagText(flags.get(0))));
		}
		StringBuilder icons = new StringBuilder();
		for (String k : List.of("rapid_fire", "shield", "speed", "double_points")) {
			if (hasPowerup(p, k)) icons.append(switch (k) {
				case "rapid_fire" -> "⚡";
				case "shield" -> "🛡";
				case "speed" -> "»";
				default -> "×2";
			}).append(' ');
		}
		if (!icons.isEmpty()) parts.add(Component.literal(icons.toString().trim()).withStyle(ChatFormatting.LIGHT_PURPLE));
		ChatFormatting heatColour = h.heat() > 70 ? ChatFormatting.RED : h.heat() > 40 ? ChatFormatting.YELLOW : ChatFormatting.AQUA;
		parts.add(Component.translatable("lasertag.hud.heat", Component.literal(GameLogic.heatBar(h)).withStyle(heatColour)));
		MutableComponent out = Component.empty();
		for (int i = 0; i < parts.size(); i++) {
			if (i > 0) out.append(Component.literal("  |  ").withStyle(ChatFormatting.DARK_GRAY));
			out.append(parts.get(i));
		}
		return out;
	}

	// ---------------------------------------------------------------- the clock

	private static void everySecond() {
		if (game == null) return;
		if (game.phase.equals("over")) {
			if (clearAt > 0 && now() >= clearAt) {
				clearScoreboard();
				removeGameBots(gameLevel());
				game = null;
				clearAt = 0;
				save();
			}
			return;
		}
		handle(server, GameLogic.second(game, Arena.pointCounts(gameLevel())));
		updateScoreboard();
		save();
	}

	private static void droppedFlags() {
		if (!running() || !game.mode.equals("capture_the_flag")) return;
		ServerLevel level = gameLevel();
		for (var entry : new ArrayList<>(game.flags.entrySet())) {
			String team = entry.getKey();
			GameLogic.Flag flag = entry.getValue();
			if (flag.state.equals("carried") && findByName(flag.carrier) instanceof Entity carrier) {
				level.sendParticles(new net.minecraft.core.particles.DustParticleOptions(R().colours().get(team).packed(), 1.0F), carrier.getX(), carrier.getY() + 2.3, carrier.getZ(), 4, 0.15, 0.15, 0.15, 0);
			}
			if (!flag.state.equals("dropped") || flag.pos == null) continue;
			net.minecraft.world.phys.Vec3 at = new net.minecraft.world.phys.Vec3(flag.pos[0], flag.pos[1] + 0.5, flag.pos[2]);
			level.sendParticles(new net.minecraft.core.particles.DustParticleOptions(R().colours().get(team).packed(), 1.2F), at.x, at.y, at.z, 6, 0.2, 0.3, 0.2, 0);
			for (Entity e : level.getEntities((Entity) null, new net.minecraft.world.phys.AABB(at, at).inflate(R().flag().touch()), x -> isActive(x) && x.position().distanceTo(at) <= R().flag().touch())) {
				List<GameLogic.Event> events = GameLogic.touchDropped(game, nameOf(e), teamOf(e), team);
				if (!events.isEmpty()) {
					handle(server, events);
					save();
					break;
				}
			}
		}
	}

	private static void tick(MinecraftServer srv) {
		server = srv;
		long t = now();
		for (var e : List.copyOf(DOWN_UNTIL.entrySet())) {
			Entity entity = findEntity(e.getKey());
			if (entity == null) {
				DOWN_UNTIL.remove(e.getKey());
				hideSign(e.getKey());
			} else if (e.getValue() <= t) comeBack(entity);
			else {
				showSign(entity, e.getValue() - t);
				// Sparks fly off a tagged vest twice a second.
				if ((e.getValue() - t) % 10 == 0 && entity.level() instanceof ServerLevel level) Lasers.sparks(level, entity, teamOf(entity));
			}
		}
		if (t % 2 == 0) {
			for (var it = HEAT.entrySet().iterator(); it.hasNext();) {
				var e = it.next();
				if (e.getValue().heat() <= 0 && !e.getValue().overheated()) it.remove();
				else e.setValue(GameLogic.cool(e.getValue(), 0.1));
			}
		}
		if (t % 5 == 0) droppedFlags();
		if (t % 5 == 0) {
			// The rifle zooms in while you sneak.
			for (ServerPlayer p : srv.getPlayerList().getPlayers()) {
				if (p.isShiftKeyDown() && p.getMainHandItem().is(LaserRegistry.GUN_ITEMS.get("laser_rifle"))) p.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 8, 4, false, false));
			}
		}
		if (t % 10 == 0) {
			for (ServerPlayer p : srv.getPlayerList().getPlayers()) {
				if (teamOf(p) == null || MESSAGE_UNTIL.getOrDefault(p.getUUID(), 0L) > t) continue;
				p.sendOverlayMessage(hud(p));
			}
		}
		if (t % 20 == 0) everySecond();
	}

	private static @Nullable Entity findEntity(UUID id) {
		ServerPlayer p = server.getPlayerList().getPlayer(id);
		if (p != null) return p;
		for (ServerLevel level : server.getAllLevels()) {
			Entity e = level.getEntity(id);
			if (e != null) return e;
		}
		return null;
	}

	// ---------------------------------------------------------------- saving

	/** The game being played, saved with the world as JSON (the same shape as on Bedrock). */
	public static final class Save extends SavedData {
		private static final Codec<Save> CODEC = Codec.STRING.xmap(Save::new, s -> s.json);
		static final SavedDataType<Save> TYPE = new SavedDataType<>(LaserRegistry.id("game"), Save::new, CODEC, null);
		private String json = "";

		public Save() {}

		private Save(String json) {
			this.json = json;
		}
	}

	private static void save() {
		if (server == null) return;
		Save s = server.overworld().getDataStorage().computeIfAbsent(Save.TYPE);
		s.json = game == null ? "" : GSON.toJson(game);
		s.setDirty();
	}

	private static void load(MinecraftServer srv) {
		server = srv;
		Save s = srv.overworld().getDataStorage().computeIfAbsent(Save.TYPE);
		try {
			game = s.json.isEmpty() ? null : GSON.fromJson(s.json, GameLogic.State.class);
		} catch (RuntimeException e) {
			game = null;
		}
		if (game != null && game.phase.equals("over")) game = null;
		if (game == null) clearScoreboard();
		for (ServerLevel level : srv.getAllLevels()) {
			for (Entity e : level.getAllEntities()) if (e instanceof LaserBot bot && bot.entityTags().contains(DOWN_TAG)) {
				wakeUp(bot);
				bot.setDown(false);
			}
		}
	}

	public static void register() {
		ServerLifecycleEvents.SERVER_STARTED.register(Game::load);
		ServerLifecycleEvents.SERVER_STOPPING.register(srv -> {
			for (UUID id : List.copyOf(SIGNS.keySet())) hideSign(id);
		});
		// A sign left over from before a restart (or a crash) belongs to nobody.
		ServerEntityEvents.ENTITY_LOAD.register((entity, level) -> {
			if (entity.entityTags().contains(SIGN_TAG) && !SIGNS.containsValue(entity)) entity.discard();
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(srv -> {
			game = null;
			server = null;
			DOWN_UNTIL.clear();
			SIGNS.clear();
			PROTECT_UNTIL.clear();
			POWERUPS.clear();
			HEAT.clear();
		});
		ServerTickEvents.END_SERVER_TICK.register(Game::tick);
		ServerPlayConnectionEvents.JOIN.register((handler, sender, srv) -> handler.player.removeTag(DOWN_TAG));
		// Left in a hurry: the flag you carried goes home.
		ServerPlayConnectionEvents.DISCONNECT.register((handler, srv) -> {
			if (!running()) return;
			List<GameLogic.Event> events = new ArrayList<>();
			for (String f : GameLogic.carrying(game, nameOf(handler.player))) {
				game.flags.put(f, new GameLogic.Flag());
				events.add(new GameLogic.Event("flag_returned", null, null, f, null, null, 0, false, null));
			}
			handle(srv, events);
		});
	}

	/** For the game tests: forget everything, as if the server had just started. */
	public static void reset(MinecraftServer srv) {
		server = srv;
		game = null;
		clearAt = 0;
		DOWN_UNTIL.clear();
		for (UUID id : List.copyOf(SIGNS.keySet())) hideSign(id);
		PROTECT_UNTIL.clear();
		POWERUPS.clear();
		HEAT.clear();
		clearScoreboard();
	}

	public static Level level() {
		return gameLevel();
	}
}
