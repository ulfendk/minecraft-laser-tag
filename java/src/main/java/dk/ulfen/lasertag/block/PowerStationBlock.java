package dk.ulfen.lasertag.block;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

/** A power-up station: walk onto it while it is charged for a power-up. */
public class PowerStationBlock extends ArenaBlock {
	public static final BooleanProperty CHARGED = BooleanProperty.create("charged");

	public PowerStationBlock(Properties properties) {
		super(properties, "station", null, 5);
		registerDefaultState(this.stateDefinition.any().setValue(CHARGED, true));
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(CHARGED);
	}
}
