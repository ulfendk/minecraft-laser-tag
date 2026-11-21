package dk.ulfen.lasertag.block;

import dk.ulfen.lasertag.game.Arena;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.phys.BlockHitResult;

/** A smoke machine: pumps haze over the arena in bursts while it is on. Use it to switch it on or off. */
public class SmokeMachineBlock extends ArenaBlock {
	public static final BooleanProperty ON = BooleanProperty.create("on");

	public SmokeMachineBlock(Properties properties) {
		super(properties, "smoke", null, 10);
		registerDefaultState(this.stateDefinition.any().setValue(ON, true));
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(ON);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (level instanceof ServerLevel server) Arena.toggleSmoke(server, pos);
		return InteractionResult.SUCCESS;
	}
}
