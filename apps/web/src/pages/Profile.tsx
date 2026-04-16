import { useState } from 'react';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { Skeleton } from '@/components/common/Skeleton';
import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { FriendList } from '@/components/profile/FriendList';
import { FriendRequests } from '@/components/profile/FriendRequests';
import { NotificationPreferences } from '@/components/profile/NotificationPreferences';
import { useSearchParams } from 'react-router';
import { useAuthStore } from '@/stores/auth.store';

const PLAYSTYLE_LABELS: Record<string, string> = {
  miner: 'Mineur',
  warrior: 'Guerrier',
  explorer: 'Explorateur',
};

function ProfileSkeleton() {
  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 lg:gap-6">
        <div className="space-y-4">
          <div className="glass-card p-4 flex flex-col items-center gap-3">
            <Skeleton className="h-24 w-24 rounded-full" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="glass-card p-4 space-y-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="glass-card p-4 space-y-3">
            <Skeleton className="h-5 w-28" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.user.getMyProfile.useQuery();
  const { data: pendingReceived } = trpc.friend.pendingReceived.useQuery();
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [bio, setBio] = useState<string | null>(null);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications'>(
    searchParams.get('tab') === 'notifications' ? 'notifications' : 'profile',
  );

  const updateMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      utils.user.getMyProfile.invalidate();
    },
  });


  if (isLoading || !profile) return <ProfileSkeleton />;

  const currentBio = bio ?? profile.bio ?? '';
  const visibility = (profile.profileVisibility ?? { bio: true, playstyle: true, stats: true }) as Record<string, boolean>;

  function handleBioBlur() {
    const newBio = bio ?? profile!.bio ?? '';
    if (newBio !== (profile!.bio ?? '')) {
      updateMutation.mutate({ bio: newBio || null });
    }
  }

  function handleSeekingAllianceToggle() {
    updateMutation.mutate({ seekingAlliance: !profile!.seekingAlliance });
  }

  function handleVisibilityChange(key: string, checked: boolean) {
    const newVisibility = { ...visibility, [key]: checked };
    updateMutation.mutate({ profileVisibility: newVisibility });
  }

  function handleAvatarSelect(avatarId: string) {
    updateMutation.mutate({ avatarId });
    const user = useAuthStore.getState().user;
    if (user) {
      localStorage.setItem('user', JSON.stringify({ ...user, avatarId }));
      useAuthStore.setState({ user: { ...user, avatarId } });
    }
  }

  const pendingCount = pendingReceived?.length ?? 0;

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Profil" />

      <div className="flex gap-1 border-b border-border/50 pb-0">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'profile' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Profil
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'notifications' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Notifications
        </button>
      </div>

      {activeTab === 'profile' && (
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 lg:gap-6">
        {/* ===== Left column ===== */}
        <div className="space-y-4">
          {/* Avatar + Identity */}
          <div className="glass-card p-4 flex flex-col items-center gap-3">
            <div className="relative">
              {profile.avatarId ? (
                <img
                  src={`/assets/avatars/${profile.avatarId}.webp`}
                  alt={profile.username}
                  className="h-24 w-24 rounded-full object-cover border-2 border-white/10"
                />
              ) : (
                <div className="h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center text-3xl font-bold text-primary">
                  {profile.username.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowAvatarPicker(true)}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Changer
            </button>

            <h2 className="text-lg font-bold">{profile.username}</h2>

            {profile.rank != null && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                #{profile.rank}
              </span>
            )}

            {profile.playstyle && (
              <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                {PLAYSTYLE_LABELS[profile.playstyle] ?? profile.playstyle}
              </span>
            )}
          </div>

          {/* Friends */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Amis</h3>
            <FriendList />
          </div>

          {/* Friend Requests */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Demandes
                {pendingCount > 0 && (
                  <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {pendingCount}
                  </span>
                )}
              </h3>
              <button
                onClick={() => setShowFriendRequests(!showFriendRequests)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showFriendRequests ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {showFriendRequests && <FriendRequests />}
          </div>
        </div>

        {/* ===== Right column ===== */}
        <div className="space-y-4">
          {/* Bio */}
          <div className="glass-card p-4 space-y-2">
            <label htmlFor="profile-bio" className="text-sm font-semibold">Bio</label>
            <textarea
              id="profile-bio"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              rows={4}
              maxLength={500}
              value={currentBio}
              onChange={(e) => setBio(e.target.value)}
              onBlur={handleBioBlur}
              placeholder="Parlez de vous..."
            />
            <div className="text-right text-xs text-muted-foreground">
              {currentBio.length}/500
            </div>
          </div>

          {/* Stats grid */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Statistiques</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-accent/50 p-3 text-center">
                <div className="text-lg font-bold text-primary">{profile.rank != null ? `#${profile.rank}` : '—'}</div>
                <div className="text-xs text-muted-foreground">Rang</div>
              </div>
              <div className="rounded-lg bg-accent/50 p-3 text-center">
                <div className="text-lg font-bold text-primary">{profile.totalPoints.toLocaleString('fr-FR')}</div>
                <div className="text-xs text-muted-foreground">Points</div>
              </div>
              <div className="rounded-lg bg-accent/50 p-3 text-center">
                <div className="text-lg font-bold text-primary">{profile.planetCount}</div>
                <div className="text-xs text-muted-foreground">Planètes</div>
              </div>
              <div className="rounded-lg bg-accent/50 p-3 text-center">
                <div className="text-lg font-bold text-primary">{profile.allianceName ?? '—'}</div>
                <div className="text-xs text-muted-foreground">Alliance</div>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="glass-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Préférences</h3>

            {/* Seeking alliance toggle */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Cherche une alliance</span>
              <button
                type="button"
                role="switch"
                aria-checked={profile.seekingAlliance}
                onClick={handleSeekingAllianceToggle}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  profile.seekingAlliance ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    profile.seekingAlliance ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

          </div>

          {/* Visibility */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Visibilité du profil</h3>
            <p className="text-xs text-muted-foreground">Choisissez ce que les autres joueurs peuvent voir.</p>
            <div className="space-y-2">
              {([
                { key: 'bio', label: 'Bio' },
                { key: 'playstyle', label: 'Style de jeu' },
                { key: 'stats', label: 'Statistiques' },
              ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibility[key] !== false}
                    onChange={(e) => handleVisibilityChange(key, e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

        </div>
      </div>
      )}

      {activeTab === 'notifications' && (
        <div className="max-w-2xl">
          <div className="glass-card p-4 lg:p-6">
            <h2 className="text-lg font-semibold mb-4">Préférences de notifications</h2>
            <NotificationPreferences />
          </div>
        </div>
      )}

      {/* Avatar picker modal */}
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
