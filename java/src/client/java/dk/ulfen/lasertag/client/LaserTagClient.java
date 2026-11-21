package dk.ulfen.lasertag.client;

import dk.ulfen.lasertag.LaserRegistry;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.client.renderer.entity.ThrownItemRenderer;

public class LaserTagClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		EntityRenderers.register(LaserRegistry.LASER_BOT, BotRenderer::new);
		EntityRenderers.register(LaserRegistry.PULSE_GRENADE_ENTITY, ThrownItemRenderer::new);
	}
}
