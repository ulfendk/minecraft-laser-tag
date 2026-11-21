package dk.ulfen.lasertag.client;

import com.geckolib.constant.dataticket.DataTicket;
import com.geckolib.model.DefaultedEntityGeoModel;
import com.geckolib.renderer.GeoEntityRenderer;
import com.geckolib.renderer.base.GeoRenderState;

import dk.ulfen.lasertag.LaserData;
import dk.ulfen.lasertag.LaserRegistry;
import dk.ulfen.lasertag.entity.LaserBot;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.resources.Identifier;
import org.jspecify.annotations.Nullable;

/** Draws a laser bot with GeckoLib, in its team's colours (textures/entity/laser_bot_<team>.png). */
public class BotRenderer extends GeoEntityRenderer<LaserBot, LivingEntityRenderState> {
	private static final DataTicket<Integer> TEAM = DataTicket.create("lasertag_team", Integer.class);

	public BotRenderer(EntityRendererProvider.Context context) {
		super(context, new TeamModel());
		this.shadowRadius = 0.4F;
	}

	@Override
	public void captureDefaultRenderState(LaserBot animatable, @Nullable Void relatedObject, LivingEntityRenderState state, float partialTick) {
		super.captureDefaultRenderState(animatable, relatedObject, state, partialTick);
		state.addGeckolibData(TEAM, animatable.teamIndex());
	}

	private static class TeamModel extends DefaultedEntityGeoModel<LaserBot> {
		private final Identifier[] textures;

		TeamModel() {
			super(LaserRegistry.id(LaserBot.ID));
			var teams = LaserData.rules().teams();
			this.textures = new Identifier[teams.size()];
			for (int i = 0; i < teams.size(); i++) this.textures[i] = LaserRegistry.id("textures/entity/" + LaserBot.ID + "_" + teams.get(i) + ".png");
		}

		@Override
		public Identifier getTextureResource(GeoRenderState renderState) {
			Integer team = renderState.getGeckolibData(TEAM);
			int i = team == null ? 0 : Math.max(0, Math.min(this.textures.length - 1, team - 1));
			return this.textures[i];
		}
	}
}
