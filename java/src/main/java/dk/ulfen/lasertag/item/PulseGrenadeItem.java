package dk.ulfen.lasertag.item;

import dk.ulfen.lasertag.entity.PulseGrenade;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/** Throw it, like a snowball. */
public class PulseGrenadeItem extends Item {
	public PulseGrenadeItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.SNOWBALL_THROW, SoundSource.PLAYERS, 0.5F, 1.4F);
		if (level instanceof ServerLevel server) {
			Projectile.spawnProjectileFromRotation(PulseGrenade::new, server, stack, player, 0.0F, 1.0F, 1.0F);
		}
		stack.consume(1, player);
		player.getCooldowns().addCooldown(stack, 10);
		return InteractionResult.SUCCESS;
	}
}
