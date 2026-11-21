package dk.ulfen.lasertag.block;

import dk.ulfen.lasertag.game.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** The game console: use it for the game menu in chat (set up and start a game, or stop it). */
public class GameConsoleBlock extends Block {
	public GameConsoleBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (player instanceof ServerPlayer sp) Commands.openMenu(sp, pos);
		return InteractionResult.SUCCESS;
	}
}
