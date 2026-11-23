package dk.ulfen.lasertag.net;

import dk.ulfen.lasertag.LaserRegistry;
import dk.ulfen.lasertag.game.Lasers;
import dk.ulfen.lasertag.item.SniperItem;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;

/** Packets: the client asks to fire the laser sniper (left click while looking through the scope). */
public final class LaserNetwork {
	private LaserNetwork() {}

	/** Client -> server: fire the sniper being aimed. */
	public record FirePayload() implements CustomPacketPayload {
		public static final Type<FirePayload> TYPE = new Type<>(LaserRegistry.id("fire"));
		public static final StreamCodec<RegistryFriendlyByteBuf, FirePayload> CODEC = StreamCodec.unit(new FirePayload());

		@Override
		public Type<FirePayload> type() {
			return TYPE;
		}
	}

	public static void register() {
		PayloadTypeRegistry.serverboundPlay().register(FirePayload.TYPE, FirePayload.CODEC);
		ServerPlayNetworking.registerGlobalReceiver(FirePayload.TYPE, (payload, context) -> {
			ServerPlayer player = context.player();
			// Only while actually looking through the scope, and once the bolt has cycled.
			ItemStack stack = player.getUseItem();
			if (!player.isUsingItem() || !(stack.getItem() instanceof SniperItem sniper)) return;
			if (player.getCooldowns().isOnCooldown(stack)) return;
			if (Lasers.fire(player, sniper.gunId(), stack)) {
				player.getCooldowns().addCooldown(stack, Math.round(Lasers.gun(sniper.gunId()).cooldown() * 20));
			}
		});
	}
}
