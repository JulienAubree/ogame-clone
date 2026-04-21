import { useState } from 'react';
import { trpc } from '@/trpc';
import { Skeleton } from '@/components/common/Skeleton';
import { useAuthStore } from '@/stores/auth.store';
import { ProfileHero } from './ProfileHero';
import { ProfileStatsCard } from './ProfileStatsCard';
import { ProfileBioCard } from './ProfileBioCard';
import { ProfileAllianceCard } from './ProfileAllianceCard';
import { ProfileSocialCard } from './ProfileSocialCard';
import { ProfilePreferencesCard } from './ProfilePreferencesCard';
import { AvatarPicker } from './AvatarPicker';
import { generateDefaultBlason } from '@exilium/shared';
import type { Blason } from '@exilium/shared';

interface ProfileViewProps {
  userId: string;
  isOwn: boolean;
}

function ViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full" />
      <div className="px-4 pb-4 lg:px-6 lg:pb-6">
        <div className="mx-auto w-full max-w-[720px] space-y-4">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="glass-card p-8 text-center">
        <p className="text-muted-foreground">Ce profil n'existe pas ou a été supprimé.</p>
      </div>
    </div>
  );
}

function OwnView() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.user.getMyProfile.useQuery();
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const updateMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => utils.user.getMyProfile.invalidate(),
  });

  if (isLoading || !profile) return <ViewSkeleton />;

  const visibility = (profile.profileVisibility ?? { bio: true, playstyle: true, stats: true }) as {
    bio: boolean;
    playstyle: boolean;
    stats: boolean;
  };

  function handleAvatarSelect(avatarId: string) {
    updateMutation.mutate({ avatarId });
    const user = useAuthStore.getState().user;
    if (user) {
      localStorage.setItem('user', JSON.stringify({ ...user, avatarId }));
      useAuthStore.setState({ user: { ...user, avatarId } });
    }
  }

  function handleBioSave(next: string | null) {
    updateMutation.mutate({ bio: next });
  }

  function handlePrefsChange(patch: { seekingAlliance?: boolean; profileVisibility?: typeof visibility }) {
    updateMutation.mutate(patch);
  }

  return (
    <div className="space-y-4">
      <ProfileHero
        username={profile.username}
        avatarId={profile.avatarId}
        rank={profile.rank}
        bio={profile.bio}
        createdAt={profile.createdAt}
        playstyle={profile.playstyle}
        seekingAlliance={profile.seekingAlliance}
        allianceTag={profile.allianceTag}
        onEditAvatar={() => setShowAvatarPicker(true)}
      />

      <div className="px-4 pb-4 lg:px-6 lg:pb-6">
        <div className="mx-auto w-full max-w-[720px] space-y-4">
          <ProfileStatsCard
            rank={profile.rank}
            totalPoints={profile.totalPoints}
            planetCount={profile.planetCount}
            allianceName={profile.allianceName}
          />

          <ProfileBioCard
            bio={profile.bio}
            isOwn={true}
            onSave={handleBioSave}
            isSaving={updateMutation.isPending}
          />

          {profile.allianceName && profile.allianceTag && (
            <ProfileAllianceCard
              allianceName={profile.allianceName}
              allianceTag={profile.allianceTag}
              blason={{
                shape: (profile.blasonShape as Blason['shape']) ?? generateDefaultBlason(profile.allianceTag).shape,
                icon: (profile.blasonIcon as Blason['icon']) ?? generateDefaultBlason(profile.allianceTag).icon,
                color1: profile.blasonColor1 ?? generateDefaultBlason(profile.allianceTag).color1,
                color2: profile.blasonColor2 ?? generateDefaultBlason(profile.allianceTag).color2,
              }}
              allianceRole={profile.allianceRole}
              isOwn={true}
            />
          )}

          <ProfileSocialCard kind="own" />

          <ProfilePreferencesCard
            seekingAlliance={profile.seekingAlliance ?? false}
            visibility={visibility}
            onChange={handlePrefsChange}
            isSaving={updateMutation.isPending}
          />
        </div>
      </div>

      {showAvatarPicker && (
        <AvatarPicker
          currentAvatarId={profile.avatarId}
          onSelect={handleAvatarSelect}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}
    </div>
  );
}

function OtherView({ userId }: { userId: string }) {
  const { data: player, isLoading, isError } = trpc.user.getProfile.useQuery(
    { userId },
    { enabled: !!userId },
  );

  if (isLoading) return <ViewSkeleton />;
  if (isError || !player) return <NotFound />;

  const allianceTag = player.stats?.allianceTag ?? null;

  return (
    <div className="space-y-4">
      <ProfileHero
        username={player.username}
        avatarId={player.avatarId}
        rank={player.stats?.rank ?? null}
        bio={player.bio}
        createdAt={player.createdAt}
        playstyle={player.playstyle}
        seekingAlliance={player.seekingAlliance}
        allianceTag={allianceTag}
      />

      <div className="px-4 pb-4 lg:px-6 lg:pb-6">
        <div className="mx-auto w-full max-w-[720px] space-y-4">
          {player.stats && (
            <ProfileStatsCard
              rank={player.stats.rank}
              totalPoints={player.stats.totalPoints}
              planetCount={player.stats.planetCount}
              allianceName={player.stats.allianceName}
            />
          )}

          <ProfileBioCard bio={player.bio} isOwn={false} />

          {player.stats?.allianceName && allianceTag && (
            <ProfileAllianceCard
              allianceName={player.stats.allianceName}
              allianceTag={allianceTag}
              blason={{
                shape: (player.stats.blasonShape as Blason['shape']) ?? generateDefaultBlason(allianceTag).shape,
                icon: (player.stats.blasonIcon as Blason['icon']) ?? generateDefaultBlason(allianceTag).icon,
                color1: player.stats.blasonColor1 ?? generateDefaultBlason(allianceTag).color1,
                color2: player.stats.blasonColor2 ?? generateDefaultBlason(allianceTag).color2,
              }}
              isOwn={false}
            />
          )}

          <ProfileSocialCard
            kind="other"
            userId={player.id}
            username={player.username}
            friendshipStatus={player.friendshipStatus}
            friendshipId={player.friendshipId}
          />
        </div>
      </div>
    </div>
  );
}

export function ProfileView({ userId, isOwn }: ProfileViewProps) {
  return isOwn ? <OwnView /> : <OtherView userId={userId} />;
}
