package dk.ulfen.lasertag.item;

import net.minecraft.world.item.Item;

/** A laser vest: it protects nothing, it only says which team you are on (and is what gets tagged). */
public class VestItem extends Item {
	private final String team;

	public VestItem(Properties properties, String team) {
		super(properties);
		this.team = team;
	}

	public String team() {
		return team;
	}
}
