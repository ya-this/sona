import type { Playlist, Track } from '../types/music';

export const ALL_TRACKS_PLAYLIST_ID = 'pl-all';
export const LIKED_PLAYLIST_ID = 'pl-liked';

export function buildAllUploadedPlaylist(
  tracks: Track[],
  fallbackCover: string,
  customCoverUrl?: string
): Playlist {
  return {
    id: ALL_TRACKS_PLAYLIST_ID,
    name: 'Все загруженные',
    description: 'Автоматический плейлист со всеми загруженными треками',
    coverUrl: customCoverUrl || tracks[0]?.coverUrl || fallbackCover,
    trackIds: tracks.map((t) => t.id),
    createdAt: 'auto',
    isAutoAll: true,
  };
}

export function buildLikedPlaylist(
  tracks: Track[],
  fallbackCover: string,
  customCoverUrl?: string
): Playlist {
  const likedTracks = tracks.filter((t) => t.liked);
  return {
    id: LIKED_PLAYLIST_ID,
    name: 'Понравившиеся',
    description: 'Автоматический локальный плейлист',
    coverUrl: customCoverUrl || likedTracks[0]?.coverUrl || fallbackCover,
    trackIds: likedTracks.map((t) => t.id),
    createdAt: 'auto',
    isAutoLiked: true,
  };
}

export function toggleTrackLikeInList(tracks: Track[], trackId: string): Track[] {
  return tracks.map((t) => (t.id === trackId ? { ...t, liked: !t.liked } : t));
}
