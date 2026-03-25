'use client';

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type Plyr from 'plyr';
import { AnnotationOverlay } from '../components/annotation/AnnotationOverlay';
import { MyAnnotationsDrawer } from '../components/annotation/MyAnnotationsDrawer';
import { AuthScreen } from '../components/auth/AuthScreen';
import { MenuDrawer } from '../components/layout/MenuDrawer';
import { TopBar } from '../components/layout/TopBar';
import { VideoLibraryDrawer } from '../components/library/VideoLibraryDrawer';
import { OnboardingOverlay } from '../components/onboarding/OnboardingOverlay';
import { PlayerSurface } from '../components/player/PlayerSurface';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import {
  buildMergeClusters,
  formatSeconds,
  normalizeSegment,
  type MergeCluster,
} from '../lib/annotation-utils';
import {
  DRIVE_LABEL_MAP,
} from '../lib/drives';
import {
  ONBOARDING_DEMO_VIDEO_KEYWORD,
  ONBOARDING_DEMO_VIDEO_SEEK_SEC,
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_VERSION,
  type OnboardingTargetId,
} from '../lib/onboarding';
import {
  pickNearestPersonFrameCandidates,
  type NormalizedBox,
  type PersonCandidate,
  type PersonFrameRow,
} from '../lib/person-utils';

type Mode = 'practice' | 'supervision';

type VideoRow = {
  id: string;
  title: string;
  storage_key: string | null;
  source_url: string | null;
  created_by: string;
  created_at: string;
};

type AnnotationRow = {
  id: string;
  video_id: string;
  user_id: string;
  start_sec: number;
  end_sec: number;
  drivers: string[];
  comment: string | null;
  person_track_id: number | null;
  person_ts_sec: number | null;
  person_box: NormalizedBox | null;
  thumb_base64: string | null;
  created_at: string;
};

type VideoOverlayLayout = {
  articleLeft: number;
  articleTop: number;
  viewportLeft: number;
  viewportTop: number;
  width: number;
  height: number;
};

const MIN_SEGMENT_SECONDS = 2;
const SNAP_STEP_SECONDS = 0.5;
const MERGE_THRESHOLD = 0.5;
const MAX_COMMENT_LENGTH = 1000;
const MIN_PLAY_URL_LOADING_MS = 450;
const PLAYBACK_RATE_OPTIONS = [0.2, 0.3, 0.5, 0.75, 1] as const;
const SPEED_MENU_WIDTH = 120;
const TAGS_ICON_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true' class='h-4 w-4'><path d='M20 10.5L13.5 4H6v7.5L12.5 18 20 10.5zm-10.5-3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM8 14l4.5 4.5a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8L16 6' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>";

function IconRefresh() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
      <path
        d='M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
      <path
        d='M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
      <path
        d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
      <path
        d='M18 6L6 18M6 6l12 12'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
      <path
        d='M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-5 w-5'>
      <path
        d='M4 7h16M4 12h16M4 17h16'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-5 w-5'>
      <path
        d='M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

function IconUserTag() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
      <path
        d='M10 14a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 7a7 7 0 0 1 14 0M21 10l-2 2m2-2-2-2m2 2h-6'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

function IconMoreVertical() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
      <circle cx='12' cy='5' r='1.75' fill='currentColor' />
      <circle cx='12' cy='12' r='1.75' fill='currentColor' />
      <circle cx='12' cy='19' r='1.75' fill='currentColor' />
    </svg>
  );
}


async function loadVideos(supabase: SupabaseClient): Promise<{ rows: VideoRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('videos')
    .select('id,title,storage_key,source_url,created_by,created_at')
    .order('created_at', { ascending: false });
  if (error) {
    return { rows: [], error: 'Cannot read videos table. Please run SQL migration first.' };
  }
  return { rows: (data ?? []) as VideoRow[], error: null };
}

async function loadAnnotations(
  supabase: SupabaseClient,
  videoId: string,
): Promise<{ rows: AnnotationRow[]; error: string | null }> {
  const primary = await supabase
    .from('annotations')
    .select(
      'id,video_id,user_id,start_sec,end_sec,drivers,comment,person_track_id,person_ts_sec,person_box,thumb_base64,created_at',
    )
    .eq('video_id', videoId)
    .order('start_sec', { ascending: true });
  if (!primary.error) {
    return { rows: (primary.data ?? []) as AnnotationRow[], error: null };
  }
  if (
    !primary.error.message.includes('person_track_id') &&
    !primary.error.message.includes('person_box') &&
    !primary.error.message.includes('person_ts_sec') &&
    !primary.error.message.includes('thumb_base64')
  ) {
    return { rows: [], error: 'Read annotations failed: ' + primary.error.message };
  }

  const fallback = await supabase
    .from('annotations')
    .select('id,video_id,user_id,start_sec,end_sec,drivers,comment,created_at')
    .eq('video_id', videoId)
    .order('start_sec', { ascending: true });
  if (fallback.error) {
    return { rows: [], error: 'Read annotations failed: ' + fallback.error.message };
  }
  const rows = (fallback.data ?? []).map((row) => ({
    ...(row as Omit<AnnotationRow, 'person_track_id' | 'person_ts_sec' | 'person_box' | 'thumb_base64'>),
    person_track_id: null,
    person_ts_sec: null,
    person_box: null,
    thumb_base64: null,
  }));
  return { rows, error: null };
}

async function loadPersonFrameRows(
  supabase: SupabaseClient,
  videoId: string,
  currentTime: number,
): Promise<{ rows: PersonFrameRow[]; error: string | null }> {
  const start = Math.max(0, currentTime - 0.8);
  const end = currentTime + 0.8;
  const { data, error } = await supabase
    .from('video_person_frames')
    .select('ts_sec,track_id,left_ratio,top_ratio,width_ratio,height_ratio,score')
    .eq('video_id', videoId)
    .gte('ts_sec', start)
    .lte('ts_sec', end)
    .order('ts_sec', { ascending: true })
    .order('score', { ascending: false });
  if (error) {
    return { rows: [], error: 'Read person candidates failed: ' + error.message };
  }
  return { rows: (data ?? []) as PersonFrameRow[], error: null };
}

function captureThumbnailBase64(video: HTMLVideoElement | null): string | null {
  if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return null;
  }
  try {
    const targetWidth = 160;
    const targetHeight = Math.max(90, Math.round((targetWidth / video.videoWidth) * video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(video, 0, 0, targetWidth, targetHeight);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.45);
    return dataUrl || null;
  } catch (error) {
    console.warn('Capture thumbnail failed (likely cross-origin tainted canvas).', error);
    return null;
  }
}

export default function Home() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const envReady = Boolean(supabase);

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authSending, setAuthSending] = useState(false);
  const [magicCooldown, setMagicCooldown] = useState(0);

  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoStorageKey, setVideoStorageKey] = useState('');
  const [videoSourceUrl, setVideoSourceUrl] = useState('');
  const [playUrl, setPlayUrl] = useState('');
  const [loadingPlayUrl, setLoadingPlayUrl] = useState(false);
  const [playUrlError, setPlayUrlError] = useState('');

  const [mode, setMode] = useState<Mode>('practice');
  const [annotations, setAnnotations] = useState<AnnotationRow[]>([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [queryError, setQueryError] = useState('');

  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState(MIN_SEGMENT_SECONDS);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [quickMode, setQuickMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [personCandidates, setPersonCandidates] = useState<PersonCandidate[]>([]);
  const [selectedPersonTrackId, setSelectedPersonTrackId] = useState<number | null>(null);
  const [selectedPersonBox, setSelectedPersonBox] = useState<NormalizedBox | null>(null);
  const [selectedPersonTsSec, setSelectedPersonTsSec] = useState<number | null>(null);
  const [isLoadingPersonCandidates, setIsLoadingPersonCandidates] = useState(false);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isMyAnnotationsOpen, setIsMyAnnotationsOpen] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [openAnnotationActionId, setOpenAnnotationActionId] = useState<string | null>(null);
  const [hoveredAnnotationActionId, setHoveredAnnotationActionId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false);
  const [isPersonPicking, setIsPersonPicking] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [annotationPortalHost, setAnnotationPortalHost] = useState<HTMLElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [speedMenuPosition, setSpeedMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [pendingPlaybackResumeSec, setPendingPlaybackResumeSec] = useState<number | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const [onboardingCompletedTargets, setOnboardingCompletedTargets] = useState<
    Partial<Record<OnboardingTargetId, boolean>>
  >({});
  const [onboardingHighlightRect, setOnboardingHighlightRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [onboardingCardPosition, setOnboardingCardPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [pendingOnboardingSeekSec, setPendingOnboardingSeekSec] = useState<number | null>(null);
  const videoSelectRef = useRef<HTMLSelectElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const forwardButtonRef = useRef<HTMLButtonElement | null>(null);
  const speedButtonRef = useRef<HTMLButtonElement | null>(null);
  const annotationButtonRef = useRef<HTMLButtonElement | null>(null);
  const personPickButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstDriverButtonRef = useRef<HTMLButtonElement | null>(null);
  const saveAnnotationButtonRef = useRef<HTMLButtonElement | null>(null);
  const myAnnotationsButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstAnnotationCardRef = useRef<HTMLElement | null>(null);
  const firstAnnotationActionButtonRef = useRef<HTMLButtonElement | null>(null);
  const onboardingPreparedStepIdsRef = useRef<Set<string>>(new Set());
  const onboardingRuntimeRef = useRef<{
    isOpen: boolean;
    targetId: OnboardingTargetId;
  }>({
    isOpen: false,
    targetId: 'video_select',
  });
  const articleRef = useRef<HTMLElement | null>(null);
  const playerMountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<Plyr | null>(null);
  const playUrlRecoveryAttemptRef = useRef(0);
  const currentVideoTimeRef = useRef(0);
  const pendingPlaybackResumeSecRef = useRef<number | null>(null);
  const annotationResumePlaybackRef = useRef(false);
  const playUrlLoadingStartedAtRef = useRef(0);
  const [videoOverlayLayout, setVideoOverlayLayout] = useState<VideoOverlayLayout | null>(null);

  const markOnboardingAction = useCallback((targetId: OnboardingTargetId) => {
    const runtime = onboardingRuntimeRef.current;
    if (!runtime.isOpen || runtime.targetId !== targetId) {
      return;
    }
    setOnboardingCompletedTargets((current) => ({
      ...current,
      [targetId]: true,
    }));
  }, []);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedVideoId) ?? null,
    [selectedVideoId, videos],
  );

  useEffect(() => {
    currentVideoTimeRef.current = currentVideoTime;
  }, [currentVideoTime]);

  useEffect(() => {
    pendingPlaybackResumeSecRef.current = pendingPlaybackResumeSec;
  }, [pendingPlaybackResumeSec]);

  useEffect(() => {
    setPersonCandidates([]);
    setSelectedPersonTrackId(null);
    setSelectedPersonBox(null);
    setSelectedPersonTsSec(null);
    setIsPersonPicking(false);
    setIsAnnotationOpen(false);
    setIsSpeedMenuOpen(false);
    setAnnotationPortalHost(null);
    setPendingPlaybackResumeSec(null);
    playUrlRecoveryAttemptRef.current = 0;
  }, [selectedVideoId]);

  useEffect(() => {
    if (magicCooldown <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setMagicCooldown((previous) => (previous <= 1 ? 0 : previous - 1));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [magicCooldown]);

  useEffect(() => {
    if (!supabase) {
      const timer = window.setTimeout(() => setAuthLoading(false), 0);
      return () => {
        window.clearTimeout(timer);
      };
    }

    let mounted = true;
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSession(data.session);
        setAuthLoading(false);
      }
    };
    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) {
      return;
    }
    let active = true;
    const run = async () => {
      const result = await loadVideos(supabase);
      if (!active) {
        return;
      }
      setQueryError(result.error ?? '');
      setVideos(result.rows);
      setSelectedVideoId((current) =>
        result.rows.some((item) => item.id === current) ? current : result.rows[0]?.id ?? '',
      );
    };
    void run();
    return () => {
      active = false;
    };
  }, [session, supabase]);

  useEffect(() => {
    if (!supabase || !session || !selectedVideoId) {
      return;
    }
    let active = true;
    const run = async () => {
      setLoadingAnnotations(true);
      const result = await loadAnnotations(supabase, selectedVideoId);
      if (!active) {
        return;
      }
      setLoadingAnnotations(false);
      setQueryError(result.error ?? '');
      setAnnotations(result.rows);
    };
    void run();
    return () => {
      active = false;
    };
  }, [selectedVideoId, session, supabase]);

  const refreshPlayUrl = useCallback(async (resumeTimeSec?: number) => {
    if (!session || !selectedVideoId) {
      return;
    }
    if (typeof resumeTimeSec === 'number') {
      pendingPlaybackResumeSecRef.current = resumeTimeSec;
      setPendingPlaybackResumeSec(resumeTimeSec);
    }
    playUrlLoadingStartedAtRef.current = performance.now();
    setLoadingPlayUrl(true);
    setPlayUrlError('');
    const response = await fetch(`/api/videos/${selectedVideoId}/play-url`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    const elapsedMs = performance.now() - playUrlLoadingStartedAtRef.current;
    const remainingMs = Math.max(0, MIN_PLAY_URL_LOADING_MS - elapsedMs);
    if (remainingMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
    }
    setLoadingPlayUrl(false);
    if (!response.ok || !payload.url) {
      setPlayUrl('');
      setPlayUrlError(payload.error ?? '生成播放链接失败。');
      return;
    }
    playUrlRecoveryAttemptRef.current = 0;
    setPlayUrl(payload.url);
  }, [selectedVideoId, session]);

  useEffect(() => {
    if (!session || !selectedVideoId) {
      return;
    }
    const timer = window.setTimeout(() => {
      void refreshPlayUrl();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshPlayUrl, selectedVideoId, session]);

  useEffect(() => {
    if (!session || !selectedVideoId || !playUrl) {
      return;
    }
    const timer = window.setInterval(() => {
      const resumeTime = videoRef.current?.currentTime ?? currentVideoTime;
      void refreshPlayUrl(resumeTime);
    }, 8 * 60 * 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [currentVideoTime, playUrl, refreshPlayUrl, selectedVideoId, session]);

  const handleSendMagicLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage('缺少 Supabase 环境变量。');
      return;
    }
    if (magicCooldown > 0 || authSending) {
      return;
    }
    setAuthMessage('');
    setAuthSending(true);
    const redirectTo =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== 'undefined' ? window.location.origin : undefined);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setAuthMessage('发送失败：' + error.message);
      setAuthSending(false);
      return;
    }
    setMagicCooldown(30);
    setAuthMessage('Magic Link 已发送，请查收邮箱。');
    setAuthSending(false);
  };

  const handleSignOut = async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setSession(null);
    setAnnotations([]);
  };

  const setSpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    if (playerRef.current) {
      playerRef.current.speed = rate;
    }
  }, []);

  const openSpeedMenu = useCallback(() => {
    const speedButton = speedButtonRef.current;
    if (!speedButton) {
      return;
    }
    const rect = speedButton.getBoundingClientRect();
    const left = Math.min(
      window.innerWidth - SPEED_MENU_WIDTH - 8,
      Math.max(8, rect.left + rect.width / 2 - SPEED_MENU_WIDTH / 2),
    );
    setSpeedMenuPosition({ left, top: Math.max(8, rect.top - 8) });
    setIsSpeedMenuOpen(true);
  }, []);

  const toggleSpeedMenu = useCallback(() => {
    if (isSpeedMenuOpen) {
      setIsSpeedMenuOpen(false);
      return;
    }
    openSpeedMenu();
  }, [isSpeedMenuOpen, openSpeedMenu]);

  const handleSelectSpeed = useCallback(
    (rate: number) => {
      setSpeed(rate);
      setIsSpeedMenuOpen(false);
    },
    [setSpeed],
  );

  const updateVideoOverlayLayout = useCallback(() => {
    const media = videoRef.current;
    const article = articleRef.current;
    if (!media || !article || media.videoWidth <= 0 || media.videoHeight <= 0) {
      setVideoOverlayLayout(null);
      return;
    }
    const mediaRect = media.getBoundingClientRect();
    const articleRect = article.getBoundingClientRect();
    const videoAspect = media.videoWidth / media.videoHeight;
    const rectAspect = mediaRect.width / mediaRect.height;

    let renderedWidth = mediaRect.width;
    let renderedHeight = mediaRect.height;
    let innerOffsetX = 0;
    let innerOffsetY = 0;
    if (rectAspect > videoAspect) {
      renderedWidth = mediaRect.height * videoAspect;
      innerOffsetX = (mediaRect.width - renderedWidth) / 2;
    } else {
      renderedHeight = mediaRect.width / videoAspect;
      innerOffsetY = (mediaRect.height - renderedHeight) / 2;
    }

    setVideoOverlayLayout({
      articleLeft: mediaRect.left - articleRect.left + innerOffsetX,
      articleTop: mediaRect.top - articleRect.top + innerOffsetY,
      viewportLeft: mediaRect.left + innerOffsetX,
      viewportTop: mediaRect.top + innerOffsetY,
      width: renderedWidth,
      height: renderedHeight,
    });
  }, []);

  const seekBySeconds = useCallback((deltaSeconds: number) => {
    if (!videoRef.current && !playerRef.current) {
      return;
    }
    const media = videoRef.current;
    const currentTime = playerRef.current?.currentTime ?? media?.currentTime ?? 0;
    const rawDuration = playerRef.current?.duration ?? media?.duration ?? Number.MAX_SAFE_INTEGER;
    const duration = Number.isFinite(rawDuration) ? rawDuration : Number.MAX_SAFE_INTEGER;
    const next = Math.min(Math.max(currentTime + deltaSeconds, 0), duration);
    if (playerRef.current) {
      playerRef.current.currentTime = next;
    } else if (media) {
      media.currentTime = next;
    }
  }, []);

  const handleVideoLoadedMetadata = useCallback(() => {
    updateVideoOverlayLayout();
    const resumeTimeSec = pendingPlaybackResumeSecRef.current;
    if (resumeTimeSec === null || !videoRef.current) {
      return;
    }
    const duration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
    const target =
      duration > 0
        ? Math.max(0, Math.min(resumeTimeSec, Math.max(0, duration - 0.1)))
        : Math.max(0, resumeTimeSec);
    videoRef.current.currentTime = target;
    currentVideoTimeRef.current = target;
    setCurrentVideoTime(target);
    pendingPlaybackResumeSecRef.current = null;
    setPendingPlaybackResumeSec(null);
  }, [updateVideoOverlayLayout]);

  const handleVideoError = useCallback(() => {
    const resumeTime = videoRef.current?.currentTime ?? currentVideoTimeRef.current;
    if (playUrlRecoveryAttemptRef.current >= 2) {
      setPlayUrlError('视频加载失败，请刷新播放链接后重试。');
      return;
    }
    playUrlRecoveryAttemptRef.current += 1;
    void refreshPlayUrl(resumeTime);
  }, [refreshPlayUrl]);

  useLayoutEffect(() => {
    const mount = playerMountRef.current;
    if (!mount || !playUrl) {
      return;
    }
    let canceled = false;
    let localPlayer: Plyr | null = null;
    const mediaElement = document.createElement('video');
    mediaElement.src = playUrl;
    mediaElement.crossOrigin = 'anonymous';
    mediaElement.playsInline = true;
    mediaElement.preload = 'metadata';
    mediaElement.className = 'h-[calc(100vh-92px)] w-full bg-black';
    mediaElement.playbackRate = playbackRate;
    const onTimeUpdate = (event: Event) => {
      const target = event.currentTarget as HTMLVideoElement;
      currentVideoTimeRef.current = target.currentTime;
      setCurrentVideoTime(target.currentTime);
    };
    mediaElement.addEventListener('loadedmetadata', handleVideoLoadedMetadata);
    mediaElement.addEventListener('timeupdate', onTimeUpdate);
    mediaElement.addEventListener('error', handleVideoError);
    mount.replaceChildren(mediaElement);
    videoRef.current = mediaElement;

    void import('plyr').then(({ default: PlyrCtor }) => {
      if (canceled || !videoRef.current) {
        return;
      }
      localPlayer = new PlyrCtor(mediaElement, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
        settings: [],
        keyboard: { focused: true, global: false },
        clickToPlay: true,
        fullscreen: { enabled: true, fallback: true, iosNative: false },
      });
      localPlayer.speed = mediaElement.playbackRate;
      localPlayer.on('enterfullscreen', () => {
        setIsPlayerFullscreen(true);
        setAnnotationPortalHost((localPlayer?.elements?.container as HTMLElement | undefined) ?? null);
      });
      localPlayer.on('exitfullscreen', () => {
        setIsPlayerFullscreen(false);
        setAnnotationPortalHost(null);
      });
      playerRef.current = localPlayer;
    });

    return () => {
      canceled = true;
      if (localPlayer) {
        try {
          localPlayer.destroy();
        } catch (error) {
          console.warn('Plyr destroy failed during source switch.', error);
        }
      }
      if (playerRef.current === localPlayer) {
        playerRef.current = null;
      }
      mediaElement.removeEventListener('loadedmetadata', handleVideoLoadedMetadata);
      mediaElement.removeEventListener('timeupdate', onTimeUpdate);
      mediaElement.removeEventListener('error', handleVideoError);
      if (videoRef.current === mediaElement) {
        videoRef.current = null;
      }
      mount.replaceChildren();
      setIsPlayerFullscreen(false);
      setAnnotationPortalHost(null);
    };
  }, [handleVideoError, handleVideoLoadedMetadata, playUrl]);

  useEffect(() => {
    updateVideoOverlayLayout();
    window.addEventListener('resize', updateVideoOverlayLayout);
    window.addEventListener('scroll', updateVideoOverlayLayout, true);
    return () => {
      window.removeEventListener('resize', updateVideoOverlayLayout);
      window.removeEventListener('scroll', updateVideoOverlayLayout, true);
    };
  }, [updateVideoOverlayLayout]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
    if (playerRef.current) {
      playerRef.current.speed = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (isAnnotationOpen) {
      const media = videoRef.current;
      const isPlaying = playerRef.current
        ? !playerRef.current.paused
        : Boolean(media && !media.paused && !media.ended);
      annotationResumePlaybackRef.current = isPlaying;
      if (playerRef.current) {
        playerRef.current.pause();
        return;
      }
      media?.pause();
      return;
    }

    if (!annotationResumePlaybackRef.current) {
      return;
    }
    annotationResumePlaybackRef.current = false;

    if (playerRef.current) {
      const playResult = playerRef.current.play();
      if (playResult && typeof playResult.then === 'function') {
        void playResult.catch(() => undefined);
      }
      return;
    }
    const nativePlayResult = videoRef.current?.play();
    if (nativePlayResult && typeof nativePlayResult.then === 'function') {
      void nativePlayResult.catch(() => undefined);
    }
  }, [isAnnotationOpen]);

  useEffect(() => {
    if (!isSpeedMenuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (speedButtonRef.current?.contains(target)) {
        return;
      }
      const menu = document.querySelector('.tapa-speed-menu');
      if (menu?.contains(target)) {
        return;
      }
      setIsSpeedMenuOpen(false);
    };
    const onWindowChange = () => openSpeedMenu();
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [isSpeedMenuOpen, openSpeedMenu]);

  const loadPersonCandidatesForTime = useCallback(
    async (currentTime: number) => {
      if (!supabase || !selectedVideoId) {
        return;
      }
      setIsLoadingPersonCandidates(true);
      const result = await loadPersonFrameRows(supabase, selectedVideoId, currentTime);
      setIsLoadingPersonCandidates(false);
      if (result.error) {
        setPersonCandidates([]);
        setSelectedPersonTrackId(null);
        setSelectedPersonBox(null);
        setSelectedPersonTsSec(null);
        setQueryError(result.error);
        return;
      }

      const candidates = pickNearestPersonFrameCandidates(result.rows, currentTime);
      setPersonCandidates(candidates);
      if (candidates.length === 0) {
        setSelectedPersonTrackId(null);
        setSelectedPersonBox(null);
        setSelectedPersonTsSec(null);
        return;
      }

      if (candidates.length === 1) {
        const only = candidates[0];
        setSelectedPersonTrackId(only.trackId);
        setSelectedPersonBox(only.box);
        setSelectedPersonTsSec(only.tsSec);
        return;
      }

      setSelectedPersonTrackId(null);
      setSelectedPersonBox(null);
      setSelectedPersonTsSec(null);
    },
    [selectedVideoId, supabase],
  );

  const selectPersonCandidate = useCallback((candidate: PersonCandidate) => {
    setSelectedPersonTrackId(candidate.trackId);
    setSelectedPersonBox(candidate.box);
    setSelectedPersonTsSec(candidate.tsSec);
    markOnboardingAction('person_pick');
  }, [markOnboardingAction]);

  const startPersonPicking = useCallback(async () => {
    const current = videoRef.current?.currentTime ?? currentVideoTime;
    if (personCandidates.length === 0) {
      await loadPersonCandidatesForTime(current);
    }
    setIsPersonPicking(true);
  }, [currentVideoTime, loadPersonCandidatesForTime, personCandidates.length]);

  const openAnnotationPanel = useCallback(() => {
    const current = videoRef.current?.currentTime ?? 0;
    const normalized = normalizeSegment(
      Math.max(0, current - 1),
      current + 1,
      SNAP_STEP_SECONDS,
      MIN_SEGMENT_SECONDS,
    );
    setSegmentStart(normalized.start);
    setSegmentEnd(normalized.end);
    setIsPersonPicking(false);
    setIsSpeedMenuOpen(false);
    setIsAnnotationOpen(true);
    void loadPersonCandidatesForTime(current);
  }, [loadPersonCandidatesForTime]);

  useEffect(() => {
    let rafId = 0;
    let canceled = false;
    const mountControls = () => {
      if (canceled) {
        return;
      }
      const controls = playerRef.current?.elements?.controls as HTMLElement | undefined;
      if (!controls) {
        rafId = window.requestAnimationFrame(mountControls);
        return;
      }
      let container = controls.querySelector('.tapa-plyr-extra') as HTMLDivElement | null;
      if (!container) {
        container = document.createElement('div');
        container.className = 'tapa-plyr-extra';
        const fullscreenButton = controls.querySelector(
          '.plyr__control[data-plyr="fullscreen"]',
        ) as HTMLElement | null;
        if (fullscreenButton) {
          controls.insertBefore(container, fullscreenButton);
        } else {
          controls.appendChild(container);
        }
      }

      const getOrCreateButton = (id: string) => {
        let button = container.querySelector<HTMLButtonElement>(`button[data-tapa-id="${id}"]`);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.dataset.tapaId = id;
          button.className = 'plyr__control tapa-plyr-extra-btn';
          container.appendChild(button);
        }
        return button;
      };

      const backButton = getOrCreateButton('back');
      backButton.textContent = '-3s';
      backButton.title = '\u540e\u9000 3 \u79d2';
      backButton.setAttribute('aria-label', '\u540e\u9000 3 \u79d2');
      backButton.onclick = () => {
        markOnboardingAction('transport_controls');
        seekBySeconds(-3);
      };

      const forwardButton = getOrCreateButton('forward');
      forwardButton.textContent = '+3s';
      forwardButton.title = '\u524d\u8fdb 3 \u79d2';
      forwardButton.setAttribute('aria-label', '\u524d\u8fdb 3 \u79d2');
      forwardButton.onclick = () => {
        markOnboardingAction('transport_controls');
        seekBySeconds(3);
      };

      const speedButton = getOrCreateButton('speed');
      speedButton.textContent = '\u23F1';
      speedButton.title = '播放速度';
      speedButton.setAttribute('aria-label', '播放速度');
      speedButton.onclick = () => {
        markOnboardingAction('transport_controls');
        toggleSpeedMenu();
      };
      speedButton.classList.add('tapa-plyr-extra-btn-icon');

      const annotationButton = getOrCreateButton('annotation');
      annotationButton.innerHTML = TAGS_ICON_SVG;
      annotationButton.title = '打开标注';
      annotationButton.setAttribute('aria-label', '打开标注');
      annotationButton.onclick = () => {
        markOnboardingAction('annotation_button');
        openAnnotationPanel();
      };
      annotationButton.classList.add('tapa-plyr-extra-btn-icon');
      annotationButton.classList.add('tapa-plyr-extra-btn-icon-svg');
      annotationButton.classList.add('tapa-plyr-extra-btn-primary');
      backButtonRef.current = backButton;
      forwardButtonRef.current = forwardButton;
      speedButtonRef.current = speedButton;
      annotationButtonRef.current = annotationButton;
    };

    mountControls();
    return () => {
      canceled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [markOnboardingAction, openAnnotationPanel, playUrl, seekBySeconds, toggleSpeedMenu]);

  const handleAddVideo = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !session) {
      return;
    }
    const title = videoTitle.trim();
    const storageKey = videoStorageKey.trim();
    if (!title || !storageKey) {
      setQueryError('标题和存储 key 为必填项。');
      return;
    }
    const { data, error } = await supabase
      .from('videos')
      .insert({
        title,
        storage_key: storageKey,
        source_url: videoSourceUrl.trim() || null,
        provider: 'hosted',
        embed_url: '',
      })
      .select('id,title,storage_key,source_url,created_by,created_at')
      .single();
    if (error) {
      setQueryError('创建视频失败：' + error.message);
      return;
    }
    const row = data as VideoRow;
    setVideos((current) => [row, ...current.filter((item) => item.id !== row.id)]);
    setSelectedVideoId(row.id);
    setVideoTitle('');
    setVideoStorageKey('');
    setVideoSourceUrl('');
    setQueryError('');
  };

  const toggleDriver = (driverId: string) => {
    markOnboardingAction('driver_select');
    setSelectedDrivers((current) =>
      current.includes(driverId)
        ? current.filter((item) => item !== driverId)
        : [...current, driverId],
    );
  };

  const refreshAnnotations = async () => {
    if (!supabase || !selectedVideoId) {
      return;
    }
    const result = await loadAnnotations(supabase, selectedVideoId);
    setQueryError(result.error ?? '');
    setAnnotations(result.rows);
  };


  const seekToTime = (seconds: number) => {
    if (!videoRef.current) {
      return;
    }
    videoRef.current.currentTime = Math.max(0, Number(seconds) || 0);
    setCurrentVideoTime(videoRef.current.currentTime);
  };

  const startEditAnnotation = (item: AnnotationRow) => {
    setEditingAnnotationId(item.id);
    setSelectedDrivers(item.drivers);
    setQuickMode(!item.comment);
    setComment(item.comment ?? '');
    setSegmentStart(item.start_sec);
    setSegmentEnd(item.end_sec);
    setSelectedPersonTrackId(item.person_track_id);
    setSelectedPersonTsSec(item.person_ts_sec);
    setSelectedPersonBox(item.person_box);
    setOpenAnnotationActionId(null);
    setIsMyAnnotationsOpen(false);
    setIsAnnotationOpen(true);
    seekToTime(item.start_sec);
  };

  const handleDeleteAnnotation = async (id: string) => {
    if (!supabase || !session) {
      return;
    }
    if (!window.confirm('\u786e\u8ba4\u5220\u9664\u8fd9\u6761\u6807\u6ce8\uff1f')) {
      return;
    }
    const { error } = await supabase
      .from('annotations')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);
    if (error) {
      setQueryError('\u5220\u9664\u6807\u6ce8\u5931\u8d25\uff1a' + error.message);
      return;
    }
    if (editingAnnotationId === id) {
      setEditingAnnotationId(null);
    }
    setOpenAnnotationActionId(null);
    await refreshAnnotations();
  };

  const handleSubmitAnnotation = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !session || !selectedVideo) {
      return;
    }
    if (selectedDrivers.length === 0) {
      setQueryError('\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u9a71\u529b\u3002');
      return;
    }
    const normalized = normalizeSegment(
      segmentStart,
      segmentEnd,
      SNAP_STEP_SECONDS,
      MIN_SEGMENT_SECONDS,
    );
    const thumbBase64 = captureThumbnailBase64(videoRef.current);
    setSaving(true);
    const payload = {
      video_id: selectedVideo.id,
      start_sec: normalized.start,
      end_sec: normalized.end,
      drivers: selectedDrivers,
      comment: quickMode ? null : comment.trim() || null,
      person_track_id: selectedPersonTrackId,
      person_ts_sec: selectedPersonTsSec,
      person_box: selectedPersonBox,
      thumb_base64: thumbBase64,
    };

    let error: { message: string } | null = null;

    if (editingAnnotationId) {
      const updateResult = await supabase
        .from('annotations')
        .update(payload)
        .eq('id', editingAnnotationId)
        .eq('user_id', session.user.id);
      error = updateResult.error;
      if (
        error?.message.includes('person_track_id') ||
        error?.message.includes('person_box') ||
        error?.message.includes('person_ts_sec') ||
        error?.message.includes('thumb_base64')
      ) {
        const fallbackResult = await supabase
          .from('annotations')
          .update({
            ...payload,
            person_track_id: null,
            person_ts_sec: null,
            person_box: null,
            thumb_base64: null,
          })
          .eq('id', editingAnnotationId)
          .eq('user_id', session.user.id);
        error = fallbackResult.error;
        if (!error) {
          setQueryError('\u5df2\u4fdd\u5b58\u6807\u6ce8\u3002\u5f53\u524d\u6570\u636e\u5e93\u7f3a\u5c11 person_* \u5b57\u6bb5\uff0c\u8bf7\u6267\u884c\u65b0 SQL migration\u3002');
        }
      }
    } else {
      const insertResult = await supabase.from('annotations').insert(payload);
      error = insertResult.error;
      if (
        error?.message.includes('person_track_id') ||
        error?.message.includes('person_box') ||
        error?.message.includes('person_ts_sec') ||
        error?.message.includes('thumb_base64')
      ) {
        const fallbackResult = await supabase.from('annotations').insert({
          ...payload,
          person_track_id: null,
          person_ts_sec: null,
          person_box: null,
          thumb_base64: null,
        });
        error = fallbackResult.error;
        if (!error) {
          setQueryError('\u5df2\u4fdd\u5b58\u6807\u6ce8\u3002\u5f53\u524d\u6570\u636e\u5e93\u7f3a\u5c11 person_* \u5b57\u6bb5\uff0c\u8bf7\u6267\u884c\u65b0 SQL migration\u3002');
        }
      }
    }

    setSaving(false);
    if (error) {
      setQueryError('\u4fdd\u5b58\u6807\u6ce8\u5931\u8d25\uff1a' + error.message);
      return;
    }

    markOnboardingAction('save_annotation');
    setSegmentStart(normalized.start);
    setSegmentEnd(normalized.end + MIN_SEGMENT_SECONDS);
    setSelectedDrivers([]);
    setComment('');
    setSelectedPersonTrackId(null);
    setSelectedPersonBox(null);
    setSelectedPersonTsSec(null);
    setEditingAnnotationId(null);
    setOpenAnnotationActionId(null);
    setQueryError('');
    await refreshAnnotations();
  };

  const visibleAnnotations = useMemo(() => {
    if (!session) {
      return [];
    }
    return mode === 'practice'
      ? annotations.filter((item) => item.user_id === session.user.id)
      : annotations;
  }, [annotations, mode, session]);

  const myAnnotations = useMemo(() => {
    if (!session) {
      return [];
    }
    return annotations.filter((item) => item.user_id === session.user.id);
  }, [annotations, session]);


  const currentVideoMyAnnotations = useMemo(() => {
    if (!selectedVideoId) {
      return [];
    }
    return myAnnotations
      .filter((item) => item.video_id === selectedVideoId)
      .sort((a, b) => b.start_sec - a.start_sec);
  }, [myAnnotations, selectedVideoId]);

  const activePersonAnnotations = useMemo(
    () =>
      visibleAnnotations.filter(
        (item) =>
          item.person_box &&
          currentVideoTime >= Number(item.start_sec) &&
          currentVideoTime <= Number(item.end_sec),
      ),
    [currentVideoTime, visibleAnnotations],
  );

  const clusters = useMemo<MergeCluster<AnnotationRow>[]>(
    () => (mode === 'supervision' ? buildMergeClusters(visibleAnnotations, MERGE_THRESHOLD) : []),
    [mode, visibleAnnotations],
  );
  const currentOnboardingStep = ONBOARDING_STEPS[onboardingStepIndex];
  const isCurrentStepActionDone =
    !currentOnboardingStep.requireAction ||
    Boolean(onboardingCompletedTargets[currentOnboardingStep.targetId]);

  const getOnboardingTargetElement = useCallback(
    (targetId: OnboardingTargetId): HTMLElement | null => {
      if (targetId === 'video_select') {
        return videoSelectRef.current;
      }
      if (targetId === 'transport_controls') {
        return speedButtonRef.current ?? backButtonRef.current ?? forwardButtonRef.current;
      }
      if (targetId === 'annotation_button') {
        return annotationButtonRef.current;
      }
      if (targetId === 'person_pick') {
        return personPickButtonRef.current;
      }
      if (targetId === 'driver_select') {
        return firstDriverButtonRef.current;
      }
      if (targetId === 'save_annotation') {
        return saveAnnotationButtonRef.current;
      }
      if (targetId === 'my_annotations_button') {
        return myAnnotationsButtonRef.current;
      }
      if (targetId === 'annotation_action') {
        return firstAnnotationActionButtonRef.current;
      }
      if (targetId === 'annotation_card') {
        return firstAnnotationCardRef.current;
      }
      if (targetId === 'menu_button') {
        return menuButtonRef.current;
      }
      return null;
    },
    [],
  );

  useEffect(() => {
    onboardingRuntimeRef.current = {
      isOpen: isOnboardingOpen,
      targetId: currentOnboardingStep.targetId,
    };
  }, [currentOnboardingStep.targetId, isOnboardingOpen]);

  useEffect(() => {
    if (!isOnboardingOpen) {
      return;
    }
    const stepId = currentOnboardingStep.id;
    if (onboardingPreparedStepIdsRef.current.has(stepId)) {
      return;
    }
    onboardingPreparedStepIdsRef.current.add(stepId);

    if (stepId === 'open_annotation_on_demo') {
      const demoVideo = videos.find((video) => video.title.includes(ONBOARDING_DEMO_VIDEO_KEYWORD));
      if (demoVideo?.id && demoVideo.id !== selectedVideoId) {
        setSelectedVideoId(demoVideo.id);
      }
      setIsMyAnnotationsOpen(false);
      setIsMenuOpen(false);
      setPendingOnboardingSeekSec(ONBOARDING_DEMO_VIDEO_SEEK_SEC);
      return;
    }

    if (stepId === 'open_annotation_action_menu' || stepId === 'jump_by_annotation_card') {
      setIsAnnotationOpen(false);
      setIsPersonPicking(false);
      setIsMyAnnotationsOpen(true);
      setIsMenuOpen(false);
      return;
    }

    if (stepId === 'open_annotation_history') {
      setIsAnnotationOpen(false);
      setIsPersonPicking(false);
      setIsMyAnnotationsOpen(false);
      setIsMenuOpen(false);
      return;
    }

    if (stepId === 'open_hamburger_menu') {
      setIsAnnotationOpen(false);
      setIsPersonPicking(false);
      setIsMyAnnotationsOpen(false);
      setIsMenuOpen(false);
    }
  }, [currentOnboardingStep.id, isOnboardingOpen, selectedVideoId, videos]);

  useEffect(() => {
    if (pendingOnboardingSeekSec === null) {
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const applySeek = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo || !Number.isFinite(currentVideo.duration) || currentVideo.duration <= 0) {
        return;
      }
      const target = Math.max(0, Math.min(pendingOnboardingSeekSec, currentVideo.duration - 0.1));
      currentVideo.currentTime = target;
      setCurrentVideoTime(target);
      setPendingOnboardingSeekSec(null);
    };
    applySeek();
    if (pendingOnboardingSeekSec !== null) {
      video.addEventListener('loadedmetadata', applySeek, { once: true });
      return () => {
        video.removeEventListener('loadedmetadata', applySeek);
      };
    }
  }, [pendingOnboardingSeekSec]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const seenVersion = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (seenVersion !== ONBOARDING_VERSION) {
      const timer = window.setTimeout(() => {
        onboardingPreparedStepIdsRef.current = new Set();
        setOnboardingStepIndex(0);
        setOnboardingCompletedTargets({});
        setPendingOnboardingSeekSec(null);
        setIsOnboardingOpen(true);
      }, 0);
      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [session]);

  useEffect(() => {
    if (!isOnboardingOpen) {
      return;
    }

    const updateOnboardingLayout = () => {
      const target = getOnboardingTargetElement(currentOnboardingStep.targetId);
      if (!target) {
        setOnboardingHighlightRect(null);
        setOnboardingCardPosition({
          top: Math.max(24, window.innerHeight / 2 - 140),
          left: Math.max(16, window.innerWidth / 2 - 220),
        });
        return;
      }

      const rect = target.getBoundingClientRect();
      const highlight = {
        top: Math.max(8, rect.top - 6),
        left: Math.max(8, rect.left - 6),
        width: rect.width + 12,
        height: rect.height + 12,
      };
      setOnboardingHighlightRect(highlight);

      const cardWidth = Math.min(440, Math.max(320, window.innerWidth - 32));
      const cardHeight = 270;
      const margin = 16;
      let left = Math.min(window.innerWidth - cardWidth - margin, Math.max(margin, rect.left));
      let top = rect.bottom + 16;
      if (top + cardHeight > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - cardHeight - 16);
      }
      if (window.innerWidth < 768) {
        left = margin;
        top = Math.max(margin, window.innerHeight - cardHeight - margin);
      }
      setOnboardingCardPosition({ top, left });
    };

    updateOnboardingLayout();
    const intervalId = window.setInterval(updateOnboardingLayout, 220);
    window.addEventListener('resize', updateOnboardingLayout);
    window.addEventListener('scroll', updateOnboardingLayout, true);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('resize', updateOnboardingLayout);
      window.removeEventListener('scroll', updateOnboardingLayout, true);
    };
  }, [
    currentOnboardingStep.targetId,
    getOnboardingTargetElement,
    isOnboardingOpen,
    isAnnotationOpen,
    isLibraryOpen,
    isMyAnnotationsOpen,
    isMenuOpen,
    currentVideoMyAnnotations.length,
  ]);

  const finishOnboarding = useCallback((markAsSeen: boolean) => {
    if (markAsSeen) {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION);
    }
    setPendingOnboardingSeekSec(null);
    setIsOnboardingOpen(false);
  }, []);

  const openOnboarding = useCallback(() => {
    onboardingPreparedStepIdsRef.current = new Set();
    setOnboardingStepIndex(0);
    setOnboardingCompletedTargets({});
    setPendingOnboardingSeekSec(null);
    setIsOnboardingOpen(true);
  }, []);

  const goOnboardingNext = () => {
    if (onboardingStepIndex >= ONBOARDING_STEPS.length - 1) {
      finishOnboarding(true);
      return;
    }
    setOnboardingStepIndex((value) => value + 1);
  };

  const goOnboardingPrev = () => {
    setOnboardingStepIndex((value) => Math.max(0, value - 1));
  };

  useEffect(() => {
    if (!isOnboardingOpen || !currentOnboardingStep.requireAction) {
      return;
    }
    if (!onboardingCompletedTargets[currentOnboardingStep.targetId]) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (onboardingStepIndex >= ONBOARDING_STEPS.length - 1) {
        finishOnboarding(true);
        return;
      }
      setOnboardingStepIndex((value) => Math.min(value + 1, ONBOARDING_STEPS.length - 1));
    }, 180);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    currentOnboardingStep.requireAction,
    currentOnboardingStep.targetId,
    finishOnboarding,
    isOnboardingOpen,
    onboardingCompletedTargets,
    onboardingStepIndex,
  ]);

  const annotationOverlay = (
    <AnnotationOverlay
      isOpen={isAnnotationOpen}
      isPlayerFullscreen={isPlayerFullscreen}
      videoOverlayLayout={videoOverlayLayout}
      isPersonPicking={isPersonPicking}
      personCandidates={personCandidates}
      selectedPersonTrackId={selectedPersonTrackId}
      selectedPersonBox={selectedPersonBox}
      selectedDrivers={selectedDrivers}
      isLoadingPersonCandidates={isLoadingPersonCandidates}
      quickMode={quickMode}
      comment={comment}
      maxCommentLength={MAX_COMMENT_LENGTH}
      saving={saving}
      selectedVideoId={selectedVideoId}
      editingAnnotationId={editingAnnotationId}
      queryError={queryError}
      firstDriverButtonRef={firstDriverButtonRef}
      personPickButtonRef={personPickButtonRef}
      saveAnnotationButtonRef={saveAnnotationButtonRef}
      closeIcon={<IconClose />}
      userTagIcon={<IconUserTag />}
      onClose={() => setIsAnnotationOpen(false)}
      onDismissPersonPicking={() => setIsPersonPicking(false)}
      onSelectPersonCandidate={(candidate) => {
        selectPersonCandidate(candidate);
        setIsPersonPicking(false);
      }}
      onSubmit={handleSubmitAnnotation}
      onToggleDriver={toggleDriver}
      onReloadCandidates={() => void loadPersonCandidatesForTime(videoRef.current?.currentTime ?? currentVideoTime)}
      onCommentChange={setComment}
      onStartPersonPicking={() => void startPersonPicking()}
      onCancelEdit={() => {
        setEditingAnnotationId(null);
        setSelectedDrivers([]);
        setComment('');
        setOpenAnnotationActionId(null);
      }}
    />
  );

  if (!session) {
    return (
      <AuthScreen
        loading={authLoading}
        envReady={envReady}
        email={email}
        authSending={authSending}
        magicCooldown={magicCooldown}
        authMessage={authMessage}
        onEmailChange={setEmail}
        onSubmit={handleSendMagicLink}
      />
    );
  }


  return (
    <main className='min-h-screen bg-zinc-100'>
      <TopBar
        videos={videos}
        selectedVideoId={selectedVideo?.id ?? ''}
        videoSelectRef={videoSelectRef}
        myAnnotationsButtonRef={myAnnotationsButtonRef}
        menuButtonRef={menuButtonRef}
        onVideoSelectClick={() => markOnboardingAction('video_select')}
        onVideoChange={(videoId) => {
          markOnboardingAction('video_select');
          setSelectedVideoId(videoId);
        }}
        onOpenAnnotations={() => {
          markOnboardingAction('my_annotations_button');
          setIsMyAnnotationsOpen(true);
        }}
        onOpenMenu={() => {
          markOnboardingAction('menu_button');
          setIsMenuOpen(true);
        }}
        annotationsButtonIcon={<IconList />}
        menuButtonIcon={<IconMenu />}
      />

      <PlayerSurface
        articleRef={articleRef}
        playerMountRef={playerMountRef}
        loadingPlayUrl={loadingPlayUrl}
        playUrl={playUrl}
        playUrlError={playUrlError}
        isAnnotationOpen={isAnnotationOpen}
        activePersonAnnotations={activePersonAnnotations.map((item) => {
          const box = item.person_box;
          if (!box || !videoOverlayLayout) {
            return null;
          }
          const labels = item.drivers
            .map((driver) => DRIVE_LABEL_MAP[driver] ?? driver)
            .join('\u3001');
          return (
            <div
              key={`person-overlay-${item.id}`}
              className='pointer-events-none absolute z-10 rounded border-2 border-blue-400'
              style={{
                left: videoOverlayLayout.articleLeft + box.left * videoOverlayLayout.width,
                top: videoOverlayLayout.articleTop + box.top * videoOverlayLayout.height,
                width: box.width * videoOverlayLayout.width,
                height: box.height * videoOverlayLayout.height,
              }}
            >
              <span className='absolute -top-7 left-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white shadow-sm'>
                {labels}
              </span>
            </div>
          );
        })}
      />

      <MyAnnotationsDrawer
        isOpen={isMyAnnotationsOpen}
        selectedVideoTitle={selectedVideo?.title ?? '\u672a\u9009\u62e9\u89c6\u9891'}
        annotations={currentVideoMyAnnotations}
        firstCardRef={firstAnnotationCardRef}
        firstActionButtonRef={firstAnnotationActionButtonRef}
        openActionId={openAnnotationActionId}
        hoveredActionId={hoveredAnnotationActionId}
        driverLabelMap={DRIVE_LABEL_MAP}
        closeIcon={<IconClose />}
        moreIcon={<IconMoreVertical />}
        onClose={() => {
          setOpenAnnotationActionId(null);
          setIsMyAnnotationsOpen(false);
        }}
        onCardClick={(_, startSec) => {
          markOnboardingAction('annotation_card');
          seekToTime(startSec);
        }}
        onActionHover={(annotationId) => setHoveredAnnotationActionId(annotationId)}
        onActionToggle={(annotationId) => {
          markOnboardingAction('annotation_action');
          setOpenAnnotationActionId((current) => (current === annotationId ? null : annotationId));
        }}
        onEdit={(annotationId) => {
          const target = currentVideoMyAnnotations.find((item) => item.id === annotationId);
          if (target) {
            startEditAnnotation(target);
          }
        }}
        onDelete={(annotationId) => void handleDeleteAnnotation(annotationId)}
        onDismissActionMenu={() => setOpenAnnotationActionId(null)}
        formatSeconds={formatSeconds}
      />

      <MenuDrawer
        isOpen={isMenuOpen}
        mode={mode}
        quickMode={quickMode}
        closeIcon={<IconClose />}
        refreshIcon={<IconRefresh />}
        folderIcon={<IconFolder />}
        helpIcon={<IconHelp />}
        signOutIcon={<IconSignOut />}
        onClose={() => setIsMenuOpen(false)}
        onModeChange={setMode}
        onQuickModeChange={setQuickMode}
        onRefreshPlayUrl={() => {
          setIsMenuOpen(false);
          void refreshPlayUrl();
        }}
        onOpenLibrary={() => {
          setIsMenuOpen(false);
          setIsLibraryOpen(true);
        }}
        onOpenHelp={() => {
          setIsMenuOpen(false);
          openOnboarding();
        }}
        onSignOut={handleSignOut}
      />

      <VideoLibraryDrawer
        isOpen={isLibraryOpen}
        videos={videos}
        selectedVideoId={selectedVideo?.id ?? ''}
        videoTitle={videoTitle}
        videoStorageKey={videoStorageKey}
        videoSourceUrl={videoSourceUrl}
        onClose={() => setIsLibraryOpen(false)}
        onSelectVideo={(videoId) => {
          setSelectedVideoId(videoId);
          setIsLibraryOpen(false);
        }}
        onTitleChange={setVideoTitle}
        onStorageKeyChange={setVideoStorageKey}
        onSourceUrlChange={setVideoSourceUrl}
        onSubmit={handleAddVideo}
      />

      {isSpeedMenuOpen && speedMenuPosition ? (
        <div
          className='tapa-speed-menu fixed z-[80] w-[120px] rounded-lg border border-zinc-300 bg-white p-1.5 shadow-xl'
          style={{ left: speedMenuPosition.left, top: speedMenuPosition.top, transform: 'translateY(-100%)' }}
          role='menu'
          aria-label='播放速度菜单'
        >
          {PLAYBACK_RATE_OPTIONS.map((rate) => (
            <button
              key={rate}
              type='button'
              role='menuitemradio'
              aria-checked={playbackRate === rate}
              className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${
                playbackRate === rate ? 'bg-blue-50 text-blue-700' : 'text-zinc-700 hover:bg-zinc-100'
              }`}
              onClick={() => handleSelectSpeed(rate)}
            >
              {rate}x
            </button>
          ))}
        </div>
      ) : null}

      {annotationPortalHost && annotationPortalHost.isConnected
        ? createPortal(annotationOverlay, annotationPortalHost)
        : annotationOverlay}

      <OnboardingOverlay
        isOpen={isOnboardingOpen}
        highlightRect={onboardingHighlightRect}
        cardPosition={onboardingCardPosition}
        currentStep={currentOnboardingStep}
        stepIndex={onboardingStepIndex}
        totalSteps={ONBOARDING_STEPS.length}
        onClose={() => finishOnboarding(true)}
        onSkip={() => finishOnboarding(true)}
        onPrev={goOnboardingPrev}
        onNext={goOnboardingNext}
        closeIcon={<IconClose />}
      />
    </main>
  );
}
