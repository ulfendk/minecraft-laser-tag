package dk.ulfen.lasertag.block;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

/** A siren: shoot it while it is charged and the lights go out, with a strobe. Then it recharges. */
public class SirenBlock extends ArenaBlock {
	public static final BooleanProperty CHARGED = BooleanProperty.create("charged");

	public SirenBlock(Properties properties) {
		super(properties, "siren", null, 10);
		registerDefaultState(this.stateDefinition.any().setValue(CHARGED, true));
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(CHARGED);
	}
}
