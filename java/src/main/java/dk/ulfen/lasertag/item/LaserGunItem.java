package dk.ulfen.lasertag.item;

import dk.ulfen.lasertag.game.Lasers;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.Level;

/** A laser gun: use it to fire (dk.ulfen.lasertag.game.Lasers does the rest). */
public class LaserGunItem extends Item {
	private final String gunId;

	public LaserGunItem(Properties properties, String gunId) {
		super(properties);
		this.gunId = gunId;
	}

	public String gunId() {
		return gunId;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (player.getCooldowns().isOnCooldown(player.getItemInHand(hand))) return InteractionResult.FAIL;
		if (player instanceof ServerPlayer sp) Lasers.fire(sp, gunId, player.getItemInHand(hand));
		return InteractionResult.SUCCESS;
	}
}
