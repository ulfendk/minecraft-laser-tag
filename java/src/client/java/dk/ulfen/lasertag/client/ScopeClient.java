package dk.ulfen.lasertag.client;

import java.util.List;

import dk.ulfen.lasertag.LaserData;
import dk.ulfen.lasertag.item.SniperItem;
import dk.ulfen.lasertag.net.LaserNetwork;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * The laser sniper's scope on the client (the Java twin of the scope in scripts/guns.js, after
 * Realistic Hunting's rifles): hold right-click to aim, left-click fires, tap sneak for the next
 * zoom level, hold sneak to steady your aim and hold your breath (not for too long).
 */
public final class ScopeClient {
	public static @Nullable String gun;
	public static int zoom;
	public static double breath = 100;
	public static boolean holding;
	public static int shaky;
	public static String range = "—";
	private static int sneakTicks = -1;
	private static double swayT = Math.random() * 1000, swayX, swayY;

	private ScopeClient() {}

	public static void init() {
		ClientTickEvents.START_CLIENT_TICK.register(ScopeClient::tick);
	}

	private static @Nullable String aiming(@Nullable LocalPlayer p) {
		if (p == null || !p.isUsingItem() || !(p.getUseItem().getItem() instanceof SniperItem sniper)) return null;
		return sniper.gunId();
	}

	private static List<Float> levels() {
		LaserData.Gun g = gun == null ? null : LaserData.rules().guns().get(gun);
		return g == null || g.scope() == null || g.scope().isEmpty() ? List.of(70F) : g.scope();
	}

	/** Field of view in degrees at the current zoom level. */
	public static double fov() {
		List<Float> l = levels();
		return l.get(Math.min(zoom, l.size() - 1));
	}

	/** Magnification against Minecraft's normal 70° field of view. */
	public static long magnification() {
		return Math.round(70 / fov());
	}

	/** FOV multiplier for the mixin: below 1 while looking through the scope. */
	public static float fovModifier(AbstractClientPlayer player) {
		Minecraft mc = Minecraft.getInstance();
		if (player != mc.player || aiming(mc.player) == null) return 1;
		return (float) (fov() / mc.options.fov().get());
	}

	private static double wobble(double t, double seed) {
		return Math.sin(t * 0.9 + seed) * 0.6 + Math.sin(t * 2.3 + seed * 1.7) * 0.3 + Math.sin(t * 5.1 + seed * 0.3) * 0.1;
	}

	private static void tick(Minecraft mc) {
		LocalPlayer p = mc.player;
		String now = aiming(p);
		if (now == null) {
			gun = null;
			sneakTicks = -1;
			holding = false;
			breath = Math.min(100, breath + 0.8);
			swayX = swayY = 0;
			return;
		}
		if (!now.equals(gun)) {
			gun = now;
			zoom = 0;
		}
		// Left click while aiming fires (vanilla would swallow the click while an item is in use).
		while (mc.options.keyAttack.consumeClick()) ClientPlayNetworking.send(new LaserNetwork.FirePayload());

		// Sneak: tap = next zoom level, hold = hold your breath.
		if (mc.options.keyShift.isDown()) {
			if (sneakTicks < 0) sneakTicks = 0;
			sneakTicks++;
			if (sneakTicks > 6 && shaky <= 0) {
				holding = true;
				breath -= 1;
				if (breath <= 0) {
					holding = false;
					shaky = 60;
				}
			}
		} else {
			if (sneakTicks >= 0 && sneakTicks <= 6) {
				zoom = (zoom + 1) % levels().size();
				p.playSound(SoundEvents.UI_BUTTON_CLICK.value(), 0.3F, 1.8F);
			}
			sneakTicks = -1;
			holding = false;
			breath = Math.min(100, breath + 0.8);
		}
		if (shaky > 0) shaky--;

		// Sway in degrees: less when crouched, almost none holding your breath, a lot out of breath or on the move.
		LaserData.Gun g = LaserData.rules().guns().get(gun);
		double amp = 0.15 * (g == null ? 1 : g.sway());
		if (p.isShiftKeyDown()) amp *= 0.45;
		if (holding) amp *= 0.12;
		if (shaky > 0) amp *= 2.5;
		Vec3 v = p.getDeltaMovement();
		if (Math.hypot(v.x, v.z) > 0.05) amp *= 3;
		swayT += 0.05;
		double tx = wobble(swayT, 1.3) * amp, ty = wobble(swayT, 7.9) * amp;
		p.setXRot((float) (p.getXRot() + (tx - swayX)));
		p.setYRot((float) (p.getYRot() + (ty - swayY)));
		swayX = tx;
		swayY = ty;

		if (p.tickCount % 4 == 0) range = rangeTo(mc, p, g == null ? 160 : g.range() * 2);
	}

	/** Range finder: blocks to whatever is under the crosshair. */
	private static String rangeTo(Minecraft mc, LocalPlayer p, double max) {
		Vec3 eye = p.getEyePosition();
		Vec3 dir = p.getViewVector(1.0F);
		HitResult block = p.pick(max, 1.0F, true);
		double best = block.getType() == HitResult.Type.MISS ? Double.MAX_VALUE : block.getLocation().distanceTo(eye);
		Vec3 end = eye.add(dir.scale(Math.min(max, best)));
		if (mc.level != null) {
			for (Entity e : mc.level.getEntities(p, new AABB(eye, end).inflate(1), Entity::isPickable)) {
				var hit = e.getBoundingBox().inflate(0.2).clip(eye, end);
				if (hit.isPresent()) best = Math.min(best, hit.get().distanceTo(eye));
			}
		}
		return best == Double.MAX_VALUE ? "—" : String.valueOf(Math.round(best));
	}
}
