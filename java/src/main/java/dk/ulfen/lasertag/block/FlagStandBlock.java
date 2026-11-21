package dk.ulfen.lasertag.block;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

/** A team's flag stand: with its flag, or without while the flag is away. */
public class FlagStandBlock extends ArenaBlock {
	public static final BooleanProperty FLAG = BooleanProperty.create("flag");

	public FlagStandBlock(Properties properties, String team) {
		super(properties, "flag", team, 5);
		registerDefaultState(this.stateDefinition.any().setValue(FLAG, true));
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(FLAG);
	}
}
