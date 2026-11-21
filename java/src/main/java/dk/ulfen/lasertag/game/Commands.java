package dk.ulfen.lasertag.game;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;

import dk.ulfen.lasertag.LaserData;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;

/**
 * The game console's menu (clickable lines in chat) and the commands behind it, the
 * Java twin of the Bedrock console form and /scriptevent lasertag:start|stop:
 *   /lasertag start [mode] [minutes] [bots per team] [teams] [score to win]
 *   /lasertag stop
 *   /lasertag set mode|minutes|bots|teams <value>   (what the menu's buttons do)
 *   /lasertag menu
 */
public final class Commands {
	/** What a player has picked in the menu, and the console they used. */
	private static final class Choice {
		String mode = "team_deathmatch";
		int minutes = LaserData.rules().console().startMinutes();
		int bots;
		int teams = 2;
		BlockPos console;
	}

	private static final Map<UUID, Choice> CHOICES = new HashMap<>();

	private Commands() {}

	private static Choice choice(ServerPlayer p) {
		return CHOICES.computeIfAbsent(p.getUUID(), u -> new Choice());
	}

	private static MutableComponent button(Component label, String command, boolean selected) {
		return Component.literal("[").append(label).append("]")
			.withStyle(s -> s.withColor(selected ? ChatFormatting.GOLD : ChatFormatting.AQUA).withBold(selected)
				.withClickEvent(new ClickEvent.RunCommand(command)).withHoverEvent(new HoverEvent.ShowText(Component.literal(command))));
	}

	private static MutableComponent row(String label, List<MutableComponent> buttons) {
		MutableComponent line = Component.translatable("lasertag.menu." + label).withStyle(ChatFormatting.GRAY).append(" ");
		for (MutableComponent b : buttons) line.append(b).append(" ");
		return line;
	}

	/** Used the game console: the menu in chat, or the stop button while a game is on. */
	public static void openMenu(ServerPlayer player, BlockPos console) {
		Choice c = choice(player);
		c.console = console.immutable();
		GameLogic.State game = Game.current();
		if (game != null && !game.phase.equals("over")) {
			player.sendSystemMessage(Component.translatable("lasertag.running").withStyle(ChatFormatting.YELLOW));
			player.sendSystemMessage(button(Component.translatable("lasertag.menu.stop"), "/lasertag stop", false).withStyle(ChatFormatting.RED));
			return;
		}
		LaserData.Rules R = LaserData.rules();
		player.sendSystemMessage(Component.translatable("lasertag.menu.title").withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD));
		player.sendSystemMessage(row("mode", GameLogic.modes().stream()
			.map(m -> button(Component.translatable("lasertag.mode." + m), "/lasertag set mode " + m, m.equals(c.mode))).toList()));
		player.sendSystemMessage(row("minutes", R.console().minutes().stream()
			.map(m -> button(Component.literal(String.valueOf(m)), "/lasertag set minutes " + m, m == c.minutes)).toList()));
		player.sendSystemMessage(row("bots", java.util.stream.IntStream.rangeClosed(0, R.console().botsPerTeam()).boxed()
			.map(n -> button(Component.literal(String.valueOf(n)), "/lasertag set bots " + n, n == c.bots)).toList()));
		player.sendSystemMessage(row("teams", java.util.stream.IntStream.rangeClosed(2, R.teams().size()).boxed()
			.map(n -> button(Component.literal(String.valueOf(n)), "/lasertag set teams " + n, n == c.teams)).toList()));
		player.sendSystemMessage(button(Component.translatable("lasertag.menu.start"), "/lasertag start", false).withStyle(ChatFormatting.GREEN));
	}

	private static int set(CommandContext<CommandSourceStack> ctx, String what) throws com.mojang.brigadier.exceptions.CommandSyntaxException {
		ServerPlayer p = ctx.getSource().getPlayerOrException();
		Choice c = choice(p);
		String value = StringArgumentType.getString(ctx, "value");
		try {
			switch (what) {
				case "mode" -> {
					if (GameLogic.modes().contains(value)) c.mode = value;
				}
				case "minutes" -> c.minutes = Math.max(1, Integer.parseInt(value));
				case "bots" -> c.bots = Math.max(0, Math.min(LaserData.rules().console().botsPerTeam(), Integer.parseInt(value)));
				case "teams" -> c.teams = Math.max(2, Math.min(LaserData.rules().teams().size(), Integer.parseInt(value)));
				default -> {}
			}
		} catch (NumberFormatException e) {
			ctx.getSource().sendFailure(Component.literal("Not a number: " + value));
			return 0;
		}
		openMenu(p, c.console != null ? c.console : p.blockPosition());
		return 1;
	}

	private static int start(CommandContext<CommandSourceStack> ctx, String mode, int minutes, int bots, int teams, int score) {
		CommandSourceStack src = ctx.getSource();
		ServerPlayer player = src.getPlayer();
		ServerLevel level = src.getLevel();
		BlockPos at = BlockPos.containing(src.getPosition());
		if (player != null) {
			Choice c = choice(player);
			if (c.console != null && c.console.distSqr(at) < 32 * 32) at = c.console;
		}
		if (!Game.start(level, at, mode, minutes, score, teams, bots, player)) {
			src.sendFailure(Component.translatable("lasertag.running"));
			return 0;
		}
		return 1;
	}

	private static int startWithChoice(CommandContext<CommandSourceStack> ctx) {
		ServerPlayer p = ctx.getSource().getPlayer();
		Choice c = p != null ? choice(p) : new Choice();
		return start(ctx, c.mode, c.minutes, c.bots, c.teams, 0);
	}

	public static void register() {
		CommandRegistrationCallback.EVENT.register((dispatcher, context, selection) -> dispatcher.register(
			net.minecraft.commands.Commands.literal("lasertag")
				.then(net.minecraft.commands.Commands.literal("menu").executes(c -> {
					ServerPlayer p = c.getSource().getPlayerOrException();
					openMenu(p, p.blockPosition());
					return 1;
				}))
				.then(net.minecraft.commands.Commands.literal("stop").executes(c -> Game.stop() ? 1 : 0))
				.then(net.minecraft.commands.Commands.literal("set")
					.then(net.minecraft.commands.Commands.literal("mode").then(net.minecraft.commands.Commands.argument("value", StringArgumentType.word())
						.suggests((c, b) -> {
							GameLogic.modes().forEach(b::suggest);
							return b.buildFuture();
						}).executes(c -> set(c, "mode"))))
					.then(net.minecraft.commands.Commands.literal("minutes").then(net.minecraft.commands.Commands.argument("value", StringArgumentType.word()).executes(c -> set(c, "minutes"))))
					.then(net.minecraft.commands.Commands.literal("bots").then(net.minecraft.commands.Commands.argument("value", StringArgumentType.word()).executes(c -> set(c, "bots"))))
					.then(net.minecraft.commands.Commands.literal("teams").then(net.minecraft.commands.Commands.argument("value", StringArgumentType.word()).executes(c -> set(c, "teams")))))
				.then(net.minecraft.commands.Commands.literal("start").executes(Commands::startWithChoice)
					.then(net.minecraft.commands.Commands.argument("mode", StringArgumentType.word())
						.suggests((c, b) -> {
							GameLogic.modes().forEach(b::suggest);
							return b.buildFuture();
						})
						.executes(c -> start(c, StringArgumentType.getString(c, "mode"), LaserData.rules().console().startMinutes(), 0, 2, 0))
						.then(net.minecraft.commands.Commands.argument("minutes", IntegerArgumentType.integer(1, 60))
							.executes(c -> start(c, StringArgumentType.getString(c, "mode"), IntegerArgumentType.getInteger(c, "minutes"), 0, 2, 0))
							.then(net.minecraft.commands.Commands.argument("bots", IntegerArgumentType.integer(0, LaserData.rules().console().botsPerTeam()))
								.executes(c -> start(c, StringArgumentType.getString(c, "mode"), IntegerArgumentType.getInteger(c, "minutes"), IntegerArgumentType.getInteger(c, "bots"), 2, 0))
								.then(net.minecraft.commands.Commands.argument("teams", IntegerArgumentType.integer(2, LaserData.rules().teams().size()))
									.executes(c -> start(c, StringArgumentType.getString(c, "mode"), IntegerArgumentType.getInteger(c, "minutes"), IntegerArgumentType.getInteger(c, "bots"), IntegerArgumentType.getInteger(c, "teams"), 0))
									.then(net.minecraft.commands.Commands.argument("score", IntegerArgumentType.integer(0, 1000))
										.executes(c -> start(c, StringArgumentType.getString(c, "mode"), IntegerArgumentType.getInteger(c, "minutes"), IntegerArgumentType.getInteger(c, "bots"), IntegerArgumentType.getInteger(c, "teams"), IntegerArgumentType.getInteger(c, "score")))))))))));
	}
}
