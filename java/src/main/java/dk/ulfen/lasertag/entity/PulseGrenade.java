package dk.ulfen.lasertag.entity;

import dk.ulfen.lasertag.LaserRegistry;
import dk.ulfen.lasertag.game.Lasers;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrowableItemProjectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.HitResult;

/** A thrown pulse grenade: where it lands it tags every vest of another team round it. */
public class PulseGrenade extends ThrowableItemProjectile {
	public PulseGrenade(EntityType<? extends PulseGrenade> type, Level level) {
		super(type, level);
	}

	public PulseGrenade(Level level, LivingEntity owner, ItemStack stack) {
		super(LaserRegistry.PULSE_GRENADE_ENTITY, owner, level, stack);
	}

	@Override
	protected Item getDefaultItem() {
		return LaserRegistry.PULSE_GRENADE;
	}

	@Override
	protected void onHit(HitResult hit) {
		super.onHit(hit);
		if (this.level() instanceof ServerLevel level) {
			Lasers.pulse(level, hit.getLocation(), this.getOwner());
			this.discard();
		}
	}
}
