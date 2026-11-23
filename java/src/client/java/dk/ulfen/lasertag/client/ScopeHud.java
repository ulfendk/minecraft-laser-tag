package dk.ulfen.lasertag.client;

import dk.ulfen.lasertag.LaserRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.CameraType;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;

/**
 * The laser sniper's scope: a round field of view with black posts and a fine laser-red cross,
 * a dot in the middle and range dots, the same as the Bedrock texture (src/hud.mjs).
 */
public final class ScopeHud {
	private static final int BLACK = 0xFF000000, INK = 0xFF0C0C0C, RED = 0xFFFF283C;

	private ScopeHud() {}

	public static void init() {
		HudElementRegistry.attachElementBefore(VanillaHudElements.CROSSHAIR, LaserRegistry.id("scope"), ScopeHud::scope);
	}

	private static void scope(GuiGraphicsExtractor g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		if (ScopeClient.gun == null || mc.options.getCameraType() != CameraType.FIRST_PERSON) return;
		int w = g.guiWidth(), h = g.guiHeight();
		int cx = w / 2, cy = h / 2;
		double r = h / 2.0 - 2;
		// Everything outside the round lens is black.
		for (int y = 0; y < h; y++) {
			double dy = y + 0.5 - cy;
			if (Math.abs(dy) >= r) {
				g.fill(0, y, w, y + 1, BLACK);
				continue;
			}
			int half = (int) Math.round(Math.sqrt(r * r - dy * dy));
			g.fill(0, y, cx - half, y + 1, BLACK);
			g.fill(cx + half, y, w, y + 1, BLACK);
		}
		int inner = (int) (r * 0.42), gap = 2;
		// Posts from the edge.
		g.fill(cx - (int) r, cy - 1, cx - inner, cy + 1, INK);
		g.fill(cx + inner, cy - 1, cx + (int) r, cy + 1, INK);
		g.fill(cx - 1, cy + inner, cx + 1, cy + (int) r, INK);
		g.fill(cx - 1, cy - (int) r, cx + 1, cy - inner, INK);
		// A fine red cross with a gap, a dot in the middle and range dots.
		g.fill(cx - inner, cy, cx - gap, cy + 1, RED);
		g.fill(cx + gap + 1, cy, cx + inner, cy + 1, RED);
		g.fill(cx, cy - inner, cx + 1, cy - gap, RED);
		g.fill(cx, cy + gap + 1, cx + 1, cy + inner, RED);
		g.fill(cx, cy, cx + 1, cy + 1, RED);
		for (int k : new int[] {-2, -1, 1, 2}) {
			int o = Math.round(k * inner / 3F);
			g.fill(cx + o, cy - 1, cx + o + 1, cy + 2, RED);
			g.fill(cx - 1, cy + o, cx + 2, cy + o + 1, RED);
		}
		// Zoom, range and breath along the bottom.
		int ty = cy + (int) (r * 0.62);
		g.centeredText(mc.font, Component.translatable("lasertag.hud.scope", String.valueOf(ScopeClient.magnification()), ScopeClient.range), cx, ty, 0xFFE8E8E8);
		if (ScopeClient.holding) g.centeredText(mc.font, Component.translatable("lasertag.hud.steady"), cx, ty + 11, 0xFF80FF80);
		else if (ScopeClient.shaky > 0) g.centeredText(mc.font, Component.translatable("lasertag.hud.shaky"), cx, ty + 11, 0xFFFF6060);
	}
}
