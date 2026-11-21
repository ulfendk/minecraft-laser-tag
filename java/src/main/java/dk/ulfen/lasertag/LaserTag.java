package dk.ulfen.lasertag;

import dk.ulfen.lasertag.game.Commands;
import dk.ulfen.lasertag.game.Game;
import net.fabricmc.api.ModInitializer;

public class LaserTag implements ModInitializer {
	public static final String MOD_ID = "lasertag";

	@Override
	public void onInitialize() {
		LaserData.rules();
		LaserRegistry.register();
		Game.register();
		Commands.register();
	}
}
