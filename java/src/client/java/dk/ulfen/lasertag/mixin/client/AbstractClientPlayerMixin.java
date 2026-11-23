package dk.ulfen.lasertag.mixin.client;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import dk.ulfen.lasertag.client.ScopeClient;
import net.minecraft.client.player.AbstractClientPlayer;

/** Zooms in while looking through the laser sniper's scope. */
@Mixin(AbstractClientPlayer.class)
public abstract class AbstractClientPlayerMixin {
	@Inject(method = "getFieldOfViewModifier", at = @At("RETURN"), cancellable = true)
	private void lasertag$zoom(boolean firstPerson, float effectScale, CallbackInfoReturnable<Float> cir) {
		float zoom = ScopeClient.fovModifier((AbstractClientPlayer) (Object) this);
		if (zoom < 1) cir.setReturnValue(zoom);
	}
}
