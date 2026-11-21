package dk.ulfen.lasertag.entity;

import com.geckolib.animatable.GeoEntity;
import com.geckolib.animatable.instance.AnimatableInstanceCache;
import com.geckolib.animatable.manager.AnimatableManager;
import com.geckolib.animation.AnimationController;
import com.geckolib.animation.RawAnimation;
import com.geckolib.animation.object.PlayState;
import com.geckolib.constant.DataTickets;
import com.geckolib.util.GeckoLibUtil;

import dk.ulfen.lasertag.LaserData;
import dk.ulfen.lasertag.game.Game;
import dk.ulfen.lasertag.game.Lasers;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RangedAttackGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * A laser bot: plays on a team, hunts anyone in another team's vest (and the other
 * teams' bots) and fires lasers at them. Lasers never hurt it; when tagged it slumps
 * ("down") and comes back on its pad like a player. Only a player's hand or weapon
 * hurts it, to clear it away. The Bedrock bot is entities/laser_bot.json + scripts/bots.js.
 */
public class LaserBot extends PathfinderMob implements GeoEntity, RangedAttackMob {
	public static final String ID = "laser_bot";
	private static final EntityDataAccessor<Integer> TEAM = SynchedEntityData.defineId(LaserBot.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Boolean> DOWN = SynchedEntityData.defineId(LaserBot.class, EntityDataSerializers.BOOLEAN);
	private static final EntityDataAccessor<Boolean> HOLD = SynchedEntityData.defineId(LaserBot.class, EntityDataSerializers.BOOLEAN);

	private final AnimatableInstanceCache geoCache = GeckoLibUtil.createInstanceCache(this);

	public LaserBot(EntityType<? extends LaserBot> type, Level level) {
		super(type, level);
		this.setPersistenceRequired();
	}

	private static LaserData.Creature data() {
		return LaserData.creature(ID);
	}

	public static AttributeSupplier.Builder createAttributes() {
		LaserData.Creature c = data();
		LaserData.Bot b = LaserData.rules().bot();
		return Mob.createMobAttributes()
			.add(Attributes.MAX_HEALTH, c.health())
			.add(Attributes.MOVEMENT_SPEED, c.speed())
			.add(Attributes.FOLLOW_RANGE, b.sight());
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(TEAM, 1);
		builder.define(DOWN, false);
		builder.define(HOLD, false);
	}

	/** The team, from 1–4 (the order of RULES.teams). */
	public int teamIndex() {
		return this.entityData.get(TEAM);
	}

	public String team() {
		var teams = LaserData.rules().teams();
		return teams.get(Math.max(0, Math.min(teams.size() - 1, teamIndex() - 1)));
	}

	public void setTeam(String team) {
		this.entityData.set(TEAM, LaserData.rules().teams().indexOf(team) + 1);
	}

	public boolean isDown() {
		return this.entityData.get(DOWN);
	}

	public void setDown(boolean down) {
		this.entityData.set(DOWN, down);
		if (down) {
			this.getNavigation().stop();
			this.setTarget(null);
		}
	}

	/** Held still: it neither walks nor fires (the game tests' targets). */
	public void setHold(boolean hold) {
		this.entityData.set(HOLD, hold);
	}

	private boolean idle() {
		return isDown() || this.entityData.get(HOLD);
	}

	@Override
	protected void registerGoals() {
		LaserData.Bot b = LaserData.rules().bot();
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(3, new RangedAttackGoal(this, 1.0, Math.round(b.interval()[0] * 20), Math.round(b.interval()[1] * 20), b.range()) {
			@Override
			public boolean canUse() {
				return !idle() && super.canUse();
			}
		});
		this.goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.8) {
			@Override
			public boolean canUse() {
				return !idle() && super.canUse();
			}
		});
		this.goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8.0F));
		this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
		this.targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, LivingEntity.class, 10, true, false,
			(target, level) -> !idle() && Game.isEnemyTarget(this, target)));
	}

	@Override
	protected void customServerAiStep(ServerLevel level) {
		super.customServerAiStep(level);
		if (idle()) {
			this.getNavigation().stop();
			if (this.getTarget() != null) this.setTarget(null);
		}
	}

	@Override
	public void performRangedAttack(LivingEntity target, float power) {
		if (!idle()) Lasers.botFire(this, target);
	}

	/** Lasers never hurt; only a player's hand or weapon (and /kill, the void) do. */
	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float damage) {
		if (!(source.getEntity() instanceof Player) && !source.is(DamageTypeTags.BYPASSES_INVULNERABILITY)) return false;
		return super.hurtServer(level, source, damage);
	}

	@Override
	public boolean removeWhenFarAway(double distance) {
		return false;
	}

	/** One from a spawn egg goes on a team at random. */
	@Override
	public @Nullable SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, EntitySpawnReason reason, @Nullable SpawnGroupData groupData) {
		this.entityData.set(TEAM, 1 + this.random.nextInt(LaserData.rules().teams().size()));
		return super.finalizeSpawn(level, difficulty, reason, groupData);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putInt("Team", teamIndex());
		output.putBoolean("Hold", this.entityData.get(HOLD));
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		this.entityData.set(TEAM, input.getIntOr("Team", 1));
		this.entityData.set(HOLD, input.getBooleanOr("Hold", false));
	}

	// ---------------------------------------------------------------- sounds

	private static SoundEvent sound(String id) {
		return BuiltInRegistries.SOUND_EVENT.getValue(Identifier.parse(id));
	}

	@Override
	protected @Nullable SoundEvent getAmbientSound() {
		return sound(data().sounds().ambient());
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return sound(data().sounds().hurt());
	}

	@Override
	protected SoundEvent getDeathSound() {
		return sound(data().sounds().death());
	}

	@Override
	protected void playStepSound(BlockPos pos, BlockState state) {
		this.playSound(sound(data().sounds().step()), 0.4F, getVoicePitch());
	}

	@Override
	public float getVoicePitch() {
		LaserData.Sounds s = data().sounds();
		return s.pitchMin() + this.random.nextFloat() * (s.pitchMax() - s.pitchMin());
	}

	// ---------------------------------------------------------------- GeckoLib

	private static String animation(String name) {
		return "animation.lasertag." + ID + "." + name;
	}

	@Override
	public void registerControllers(AnimatableManager.ControllerRegistrar controllers) {
		controllers.add(new AnimationController<LaserBot>("move", 4, state -> {
			if (state.animatable().isDown()) return state.setAndContinue(RawAnimation.begin().thenLoop(animation("down")));
			Vec3 v = state.getDataOrDefault(DataTickets.VELOCITY, Vec3.ZERO);
			double speed = Math.sqrt(v.x * v.x + v.z * v.z) * 20;
			return state.setAndContinue(RawAnimation.begin().thenLoop(animation(speed > 0.3 ? "walk" : "idle")));
		}));
		AnimationController<LaserBot> action = new AnimationController<>("action", 1, state -> PlayState.STOP);
		action.triggerableAnim("attack", RawAnimation.begin().thenPlay(animation("attack")));
		controllers.add(action);
	}

	@Override
	public AnimatableInstanceCache getAnimatableInstanceCache() {
		return this.geoCache;
	}
}
