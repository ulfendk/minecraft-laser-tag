package dk.ulfen.lasertag;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import dk.ulfen.lasertag.block.ArenaBlock;
import dk.ulfen.lasertag.block.ControlPointBlock;
import dk.ulfen.lasertag.block.FlagStandBlock;
import dk.ulfen.lasertag.block.GameConsoleBlock;
import dk.ulfen.lasertag.block.PowerStationBlock;
import dk.ulfen.lasertag.block.SirenBlock;
import dk.ulfen.lasertag.block.SmokeMachineBlock;
import dk.ulfen.lasertag.entity.LaserBot;
import dk.ulfen.lasertag.entity.PulseGrenade;
import dk.ulfen.lasertag.item.LaserGunItem;
import dk.ulfen.lasertag.item.PulseGrenadeItem;
import dk.ulfen.lasertag.item.SniperItem;
import dk.ulfen.lasertag.item.VestItem;
import net.fabricmc.fabric.api.creativetab.v1.FabricCreativeModeTab;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.TagKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.item.equipment.ArmorMaterial;
import net.minecraft.world.item.equipment.ArmorType;
import net.minecraft.world.item.equipment.EquipmentAsset;
import net.minecraft.world.item.equipment.EquipmentAssets;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;

/** Everything the mod adds to the game registries. */
public final class LaserRegistry {
	public static final List<String> GUNS = List.of("laser_pistol", "laser_blaster", "laser_rifle", "scatter_laser", "laser_sniper", "spread_cannon");
	/** The gun that fires through a scope (dk.ulfen.lasertag.item.SniperItem). */
	public static final String SNIPER = "laser_sniper";
	public static final List<String> NEON = List.of("white", "red", "blue", "green", "yellow", "cyan", "magenta");

	public static EntityType<LaserBot> LASER_BOT;
	public static EntityType<PulseGrenade> PULSE_GRENADE_ENTITY;
	public static Item PULSE_GRENADE, LASER_BOT_SPAWN_EGG;
	public static final Map<String, Item> GUN_ITEMS = new HashMap<>();
	public static final Map<String, Item> VESTS = new HashMap<>();
	public static GameConsoleBlock GAME_CONSOLE;
	public static ControlPointBlock CONTROL_POINT;
	public static PowerStationBlock POWER_STATION;
	public static SmokeMachineBlock SMOKE_MACHINE;
	public static SirenBlock SIREN;
	public static final Map<String, ArenaBlock> SPAWN_PADS = new HashMap<>();
	public static final Map<String, FlagStandBlock> FLAG_STANDS = new HashMap<>();
	/** Every block and its item, in creative-tab order. */
	public static final List<Item> BLOCK_ITEMS = new ArrayList<>();

	private static final TagKey<Item> REPAIRS_VEST = TagKey.create(Registries.ITEM, id("repairs_vest"));

	private LaserRegistry() {}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(LaserTag.MOD_ID, path);
	}

	static void register() {
		LaserData.Creature bot = LaserData.creature("laser_bot");
		LASER_BOT = entity("laser_bot", EntityType.Builder.of(LaserBot::new, MobCategory.MISC).fireImmune().sized(bot.width(), bot.height()).clientTrackingRange(10));
		FabricDefaultAttributeRegistry.register(LASER_BOT, LaserBot.createAttributes());
		PULSE_GRENADE_ENTITY = entity("pulse_grenade", EntityType.Builder.<PulseGrenade>of(PulseGrenade::new, MobCategory.MISC).noLootTable().sized(0.25F, 0.25F).clientTrackingRange(4).updateInterval(10));

		for (String gun : GUNS) {
			// The sniper's first use raises the scope, so its cooldown starts when it fires (Lasers.fire).
			if (gun.equals(SNIPER)) GUN_ITEMS.put(gun, item(gun, p -> new SniperItem(p, gun), new Item.Properties().stacksTo(1)));
			else GUN_ITEMS.put(gun, item(gun, p -> new LaserGunItem(p, gun), new Item.Properties().stacksTo(1).useCooldown(LaserData.rules().guns().get(gun).cooldown())));
		}
		PULSE_GRENADE = item("pulse_grenade", PulseGrenadeItem::new, new Item.Properties().stacksTo(16));
		for (String team : LaserData.rules().teams()) {
			// A vest protects nothing: no armour points, no toughness.
			ArmorMaterial material = new ArmorMaterial(10, Map.of(ArmorType.HELMET, 0, ArmorType.CHESTPLATE, 0, ArmorType.LEGGINGS, 0, ArmorType.BOOTS, 0),
				15, SoundEvents.ARMOR_EQUIP_LEATHER, 0.0F, 0.0F, REPAIRS_VEST, ResourceKey.create(EquipmentAssets.ROOT_ID, id("vest_" + team)));
			VESTS.put(team, item("vest_" + team, p -> new VestItem(p, team), new Item.Properties().humanoidArmor(material, ArmorType.CHESTPLATE)));
		}
		LASER_BOT_SPAWN_EGG = item("laser_bot_spawn_egg", SpawnEggItem::new, new Item.Properties().spawnEgg(LASER_BOT));

		var metal = BlockBehaviour.Properties.of().mapColor(MapColor.METAL).strength(3.0F, 6.0F).sound(SoundType.METAL);
		GAME_CONSOLE = block("game_console", GameConsoleBlock::new, metal.lightLevel(s -> 7));
		for (String team : LaserData.rules().teams()) {
			SPAWN_PADS.put(team, block("spawn_pad_" + team, p -> new ArenaBlock(p, "pad", team, 20), metal.lightLevel(s -> 10)));
		}
		for (String team : LaserData.rules().teams()) {
			FLAG_STANDS.put(team, block("flag_stand_" + team, p -> new FlagStandBlock(p, team), metal.lightLevel(s -> 9)));
		}
		CONTROL_POINT = block("control_point", ControlPointBlock::new, metal.lightLevel(s -> 12));
		POWER_STATION = block("power_station", PowerStationBlock::new, metal.lightLevel(s -> 10));
		SMOKE_MACHINE = block("smoke_machine", SmokeMachineBlock::new, metal.lightLevel(s -> 3));
		SIREN = block("siren", SirenBlock::new, metal.lightLevel(s -> 8));
		block("scoreboard_screen", Block::new, metal.lightLevel(s -> 10));
		for (String colour : NEON) {
			block("neon_panel_" + colour, Block::new, BlockBehaviour.Properties.of().mapColor(MapColor.SNOW).strength(0.8F).sound(SoundType.GLASS).lightLevel(s -> 15));
		}
		block("cover_crate", Block::new, metal.lightLevel(s -> 4));
		block("blacklight_floor", Block::new, BlockBehaviour.Properties.of().mapColor(MapColor.COLOR_PURPLE).strength(1.5F, 6.0F).sound(SoundType.STONE).lightLevel(s -> 6));

		CreativeModeTab tab = FabricCreativeModeTab.builder()
			.title(Component.translatable("itemGroup.lasertag"))
			.icon(() -> new ItemStack(GUN_ITEMS.get("laser_blaster")))
			.displayItems((params, out) -> {
				for (String gun : GUNS) out.accept(GUN_ITEMS.get(gun));
				out.accept(PULSE_GRENADE);
				for (String team : LaserData.rules().teams()) out.accept(VESTS.get(team));
				BLOCK_ITEMS.forEach(out::accept);
				out.accept(LASER_BOT_SPAWN_EGG);
			})
			.build();
		Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, id("laser_tag"), tab);
	}

	private static <T extends net.minecraft.world.entity.Entity> EntityType<T> entity(String name, EntityType.Builder<T> builder) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, id(name));
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, builder.build(key));
	}

	private static <T extends Item> T item(String name, Function<Item.Properties, T> factory, Item.Properties props) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, id(name));
		return Registry.register(BuiltInRegistries.ITEM, key, factory.apply(props.setId(key)));
	}

	private static <T extends Block> T block(String name, Function<BlockBehaviour.Properties, T> factory, BlockBehaviour.Properties props) {
		ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, id(name));
		T block = Registry.register(BuiltInRegistries.BLOCK, key, factory.apply(props.setId(key)));
		BLOCK_ITEMS.add(item(name, p -> new BlockItem(block, p), new Item.Properties().useBlockDescriptionPrefix()));
		return block;
	}
}
