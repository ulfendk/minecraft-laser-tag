package dk.ulfen.lasertag.game;

import dk.ulfen.lasertag.LaserData;
import dk.ulfen.lasertag.entity.LaserBot;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * The lasers: hitscan rays drawn as a line of glowing dust in the shooter's team
 * colour. A ray stops at the first block in its way and tags the first vest (or bot)
 * it meets. The twin of scripts/guns.js.
 */
public final class Lasers {
	private Lasers() {}

	private static LaserData.Rules R() {
		return LaserData.rules();
	}

	private static int colour(@Nullable String team) {
		return team == null ? 0xEBF0FF : R().colours().get(team).packed();
	}

	public static void beam(ServerLevel level, Vec3 from, Vec3 dir, double length, @Nullable String team) {
		DustParticleOptions dust = new DustParticleOptions(colour(team), 0.6F);
		for (double s = 0.6; s < length; s += 0.45) {
			Vec3 p = from.add(dir.scale(s));
			level.sendParticles(dust, p.x, p.y, p.z, 1, 0, 0, 0, 0);
		}
	}

	public static void sparks(ServerLevel level, Entity e, @Nullable String team) {
		level.sendParticles(new DustParticleOptions(colour(team), 1.0F), e.getX(), e.getY() + 1.1, e.getZ(), 14, 0.3, 0.3, 0.3, 0.1);
	}

	/** Fire one ray: draw it and tag what it hits. Returns "tagged", "shield", "blocked" or null (nothing hit). */
	public static @Nullable String fireRay(LivingEntity shooter, Vec3 from, Vec3 dir, double range) {
		if (!(shooter.level() instanceof ServerLevel level)) return null;
		Vec3 to = from.add(dir.scale(range));
		BlockHitResult block = level.clip(new ClipContext(from, to, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, shooter));
		double wall = block.getType() == HitResult.Type.MISS ? range : from.distanceTo(block.getLocation());
		Vec3 stop = from.add(dir.scale(wall));
		Entity best = null;
		double bestD = wall;
		for (Entity e : level.getEntities(shooter, new AABB(from, stop).inflate(1), x -> (x instanceof Player || x instanceof LaserBot) && x.isAlive() && Game.teamOf(x) != null)) {
			var clip = e.getBoundingBox().inflate(0.1).clip(from, stop);
			if (clip.isPresent() && clip.get().distanceTo(from) < bestD) {
				best = e;
				bestD = clip.get().distanceTo(from);
			}
		}
		beam(level, from, dir, best != null ? bestD : wall, Game.teamOf(shooter));
		if (best == null) return null;
		String result = Game.tag(shooter, best);
		return result != null ? result : "blocked";
	}

	/** `dir` turned off course by up to `degrees`, at random. */
	public static Vec3 spread(Vec3 dir, double degrees, RandomSource random) {
		if (degrees <= 0) return dir;
		double r = Math.toRadians(degrees);
		double a = random.nextDouble() * Math.PI * 2, m = Math.sqrt(random.nextDouble()) * r;
		Vec3 up = Math.abs(dir.y) < 0.9 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0);
		Vec3 u = dir.cross(up).normalize();
		Vec3 v = dir.cross(u);
		return dir.add(u.scale(Math.cos(a) * Math.tan(m))).add(v.scale(Math.sin(a) * Math.tan(m))).normalize();
	}

	/** A player pulls the trigger. */
	public static boolean fire(ServerPlayer player, String gunId, ItemStack stack) {
		LaserData.Gun g = R().guns().get(gunId);
		String why = Game.cannotFire(player);
		if (why != null) {
			if (!why.equals("down")) {
				Game.flash(player, why);
				player.level().playSound(null, player.blockPosition(), SoundEvents.UI_BUTTON_CLICK.value(), SoundSource.PLAYERS, 0.4F, 0.6F);
			}
			return false;
		}
		GameLogic.Heat h = Game.heatOf(player);
		if (h.overheated()) {
			player.level().playSound(null, player.blockPosition(), SoundEvents.FIRE_EXTINGUISH, SoundSource.PLAYERS, 0.4F, 1.6F);
			return false;
		}
		GameLogic.Heat after = GameLogic.shotHeat(h, gunId, Game.hasPowerup(player, "rapid_fire"));
		Game.setHeat(player, after);
		if (after.overheated()) player.level().playSound(null, player.blockPosition(), SoundEvents.FIRE_EXTINGUISH, SoundSource.PLAYERS, 0.6F, 1.2F);
		Vec3 eye = player.getEyePosition();
		Vec3 view = player.getLookAngle();
		int tagged = 0;
		for (int i = 0; i < g.rays(); i++) {
			String result = fireRay(player, eye, spread(view, g.spread(), player.getRandom()), g.range());
			if ("tagged".equals(result) || "shield".equals(result)) tagged++;
		}
		Game.recordShot(player, tagged);
		float pitch = switch (gunId) {
			case "laser_pistol" -> 2.0F;
			case "laser_blaster" -> 1.7F;
			case "laser_rifle" -> 1.2F;
			default -> 1.4F;
		};
		player.level().playSound(null, player.blockPosition(), SoundEvents.SHULKER_SHOOT, SoundSource.PLAYERS, 0.7F, pitch);
		return true;
	}

	/** A bot fires at `target`: usually on target, now and then a block or so off. */
	public static boolean botFire(LaserBot bot, LivingEntity target) {
		if (Game.isDown(bot) || Game.teamOf(bot) == null) return false;
		Vec3 eye = bot.getEyePosition();
		Vec3 aim = target.position().add(0, 1, 0);
		RandomSource random = bot.getRandom();
		if (random.nextFloat() > R().bot().accuracy()) {
			double a = random.nextDouble() * Math.PI * 2;
			aim = aim.add(Math.cos(a) * 1.2, random.nextDouble() - 0.5, Math.sin(a) * 1.2);
		}
		String result = fireRay(bot, eye, aim.subtract(eye).normalize(), R().bot().range() + 4);
		Game.recordShot(bot, "tagged".equals(result) || "shield".equals(result) ? 1 : 0);
		bot.level().playSound(null, bot.blockPosition(), SoundEvents.SHULKER_SHOOT, SoundSource.HOSTILE, 0.6F, 1.8F);
		bot.triggerAnim("action", "attack");
		return true;
	}

	/** The pulse grenade went off: every enemy vest within its radius is tagged. */
	public static int pulse(ServerLevel level, Vec3 at, @Nullable Entity source) {
		String team = source == null ? null : Game.teamOf(source);
		level.sendParticles(new DustParticleOptions(colour(team), 1.2F), at.x, at.y, at.z, 30, 0.6, 0.4, 0.6, 0.1);
		double radius = R().grenade().radius();
		for (int i = 0; i < 16; i++) {
			double a = i * Math.PI * 2 / 16;
			level.sendParticles(new DustParticleOptions(colour(team), 0.8F), at.x + Math.cos(a) * radius, at.y + 0.3, at.z + Math.sin(a) * radius, 1, 0, 0, 0, 0);
		}
		level.playSound(null, at.x, at.y, at.z, SoundEvents.FIREWORK_ROCKET_BLAST, SoundSource.PLAYERS, 1.0F, 1.4F);
		if (!(source instanceof LivingEntity shooter) || !source.isAlive()) return 0;
		int n = 0;
		for (Entity e : level.getEntities(source, new AABB(at, at).inflate(radius), x -> (x instanceof Player || x instanceof LaserBot) && x.position().distanceTo(at) <= radius)) {
			if ("tagged".equals(Game.tag(shooter, e))) n++;
		}
		return n;
	}
}
