package dk.ulfen.lasertag.block;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.IntegerProperty;

/** A control point, lit in the colour of the team that holds it (0 nobody, 1–4 the teams). */
public class ControlPointBlock extends ArenaBlock {
	public static final IntegerProperty OWNER = IntegerProperty.create("owner", 0, 4);

	public ControlPointBlock(Properties properties) {
		super(properties, "point", null, 20);
		registerDefaultState(this.stateDefinition.any().setValue(OWNER, 0));
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(OWNER);
	}
}
