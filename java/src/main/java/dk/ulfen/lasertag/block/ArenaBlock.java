package dk.ulfen.lasertag.block;

import dk.ulfen.lasertag.game.Arena;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/**
 * One of the arena's game blocks (a spawn pad here; flag stands, control points and
 * power-up stations extend it). It ticks every `interval` ticks on scheduled ticks,
 * which are saved with the world, and so tells the game where it is
 * (dk.ulfen.lasertag.game.Arena), like the minecraft:tick blocks on Bedrock.
 */
public class ArenaBlock extends Block {
	private final String kind;
	private final @Nullable String team;
	private final int interval;

	public ArenaBlock(Properties properties, String kind, @Nullable String team, int interval) {
		super(properties);
		this.kind = kind;
		this.team = team;
		this.interval = interval;
	}

	public String kind() {
		return kind;
	}

	public @Nullable String team() {
		return team;
	}

	@Override
	protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState old, boolean moved) {
		if (!old.is(this) && level instanceof ServerLevel server) {
			Arena.tick(server, pos, state, this);
			level.scheduleTick(pos, this, interval);
		}
	}

	@Override
	protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		Arena.tick(level, pos, state, this);
		level.scheduleTick(pos, this, interval);
	}

	@Override
	protected void affectNeighborsAfterRemoval(BlockState state, ServerLevel level, BlockPos pos, boolean moved) {
		Arena.forget(level, pos);
	}
}
