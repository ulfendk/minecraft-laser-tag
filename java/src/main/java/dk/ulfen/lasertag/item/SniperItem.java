package dk.ulfen.lasertag.item;

import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.level.Level;

/**
 * The laser sniper, scoped like Realistic Hunting's rifles: hold right-click to look through the
 * scope (the client zooms and draws it, client/ScopeClient), left-click while aiming to fire
 * (LaserNetwork.FirePayload). Tap sneak for the next zoom level, hold it to hold your breath.
 */
public class SniperItem extends LaserGunItem {
	public SniperItem(Properties properties, String gunId) {
		super(properties, gunId);
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.SPYGLASS;
	}

	@Override
	public int getUseDuration(ItemStack stack, LivingEntity user) {
		return 72000;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (hand != InteractionHand.MAIN_HAND) return InteractionResult.PASS;
		player.startUsingItem(hand);
		if (level.isClientSide()) player.playSound(SoundEvents.SPYGLASS_USE, 1.0F, 1.0F);
		return InteractionResult.CONSUME;
	}

	@Override
	public boolean releaseUsing(ItemStack stack, Level level, LivingEntity entity, int remainingTime) {
		if (level.isClientSide()) entity.playSound(SoundEvents.SPYGLASS_STOP_USING, 1.0F, 1.0F);
		return false;
	}
}
