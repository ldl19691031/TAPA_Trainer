'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type Plyr from 'plyr';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import {
  buildMergeClusters,
  formatSeconds,
  normalizeSegment,
  type MergeCluster,
} from '../lib/annotation-utils';
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
const ONBOARDING_STORAGE_KEY = 'tapa_onboarding_seen_v1';
const PLAYBACK_RATE_OPTIONS = [0.2, 0.3, 0.5, 0.75, 1] as const;
const SPEED_MENU_WIDTH = 120;
const TAGS_ICON_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true' class='h-4 w-4'><path d='M20 10.5L13.5 4H6v7.5L12.5 18 20 10.5zm-10.5-3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM8 14l4.5 4.5a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8L16 6' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>";

type OnboardingTargetId = 'video_select' | 'annotation_button' | 'speed_button';

type OnboardingStep = {
  title: string;
  description: string;
  targetId: OnboardingTargetId;
  requireAction: boolean;
  actionHint?: string;
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Switch Video',
    description:
      'Use the top-left dropdown to switch the current training video. Related annotations will refresh automatically.',
    targetId: 'video_select',
    requireAction: true,
    actionHint: 'Click the top-left video dropdown once, then continue.',
  },
  {
    title: 'Add Annotation',
    description:
      'Use the annotation button in the player controls to open the panel. The time segment defaults to around current time +/- 2 seconds.',
    targetId: 'annotation_button',
    requireAction: false,
  },
  {
    title: 'Speed Control',
    description:
      'Use the speed button in the player controls to cycle 0.2x, 0.3x, 0.5x, 0.75x and 1x.',
    targetId: 'speed_button',
    requireAction: false,
  },
] as const;

type DriveCue = {
  lexicon: string;
  tone: string;
  gesture: string;
  posture: string;
  face: string;
};

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

const CUE_ROWS: Array<{ key: keyof DriveCue; icon: string }> = [
  { key: 'lexicon', icon: '\u{1F4AC}' }, // speech balloon
  { key: 'tone', icon: '\u{1F3B5}' }, // musical note
  { key: 'gesture', icon: '\u{1F44B}' }, // waving hand
  { key: 'posture', icon: '\u{1F9CD}' }, // standing person
  { key: 'face', icon: '\u{1F642}' }, // slight smile
];

const DRIVE_OPTIONS = [
  {
    id: 'be_perfect',
    label: '\u8981\u5b8c\u7f8e',
    cues: {
      lexicon: '\u5e38\u7528\u63d2\u5165\u8bed\u3001\u5217\u70b9\u6570\uff0c\u5982\u201c\u548c\u539f\u672c\u4e00\u6837\u201d\u201c\u6b63\u5982\u6211\u4eec\u6240\u89c1\u201d\u201c\u4e5f\u5c31\u662f\u8bf4\u201d',
      tone: '\u6e05\u8106\u3001\u5e73\u7f13\u3001\u8282\u594f\u826f\u597d\uff0c\u53d1\u97f3\u51c6\u786e\u6e05\u6670',
      gesture: '\u624b\u6307\u6bd4\u5212\uff0c\u62c7\u6307\u4e0e\u98df\u6307\u634f\u6210\u201c\u5854\u5c16\u201d(V)\u5f62',
      posture: '\u59ff\u6001\u633a\u76f4\uff0c\u5de6\u53f3\u8f83\u5747\u8861',
      face: '\u505c\u987f\u65f6\u76ee\u5149\u5f80\u4e0a\u4fa7\uff08\u5f88\u5c11\u5411\u4e0b\uff09\uff0c\u5634\u7565\u7d27\u7ef7\uff0c\u5634\u89d2\u5411\u5916\u4fa7\u62c9',
    },
  },
  {
    id: 'be_strong',
    label: '\u8981\u575a\u5f3a',
    cues: {
      lexicon: '\u5e38\u89c1\u201c\u758f\u8fdc\u201d\uff0c\u6216\u201c\u4f60\u8ba9\u6211\u5f88\u751f\u6c14/\u65e0\u804a/\u96be\u53d7\u201d',
      tone: '\u5e73\u7f13\u3001\u5355\u8c03\uff0c\u901a\u5e38\u97f3\u91cf\u8f83\u4f4e',
      gesture: '\u5f88\u5c11\u6216\u57fa\u672c\u6ca1\u6709\u624b\u52bf',
      posture: '\u5b89\u9759\u3001\u5c01\u95ed\uff08\u624b\u81c2\u4ea4\u53c9/\u53cc\u817f\u4ea4\u53c9\uff09',
      face: '\u5b89\u9759\uff0c\u9762\u90e8\u8868\u60c5\u8f83\u5c11',
    },
  },
  {
    id: 'try_hard',
    label: '\u8981\u52aa\u529b\u8bd5',
    cues: {
      lexicon: '\u5e38\u6709\u201c\u54c8\uff1f\u554a\uff1f\u4ec0\u4e48\uff1f\u201d\u3001\u201c\u6211\u4f1a\u8bd5\u7740...\u201d\u3001\u201c\u6211\u4e0d\u80fd/\u8fd9\u5f88\u96be/\u6211\u4e0d\u61c2\u201d',
      tone: '\u7d27\u5f20\u3001\u987f\u632b\u3001\u538b\u6291\u6216\u6c89\u95f7',
      gesture: '\u624b\u653e\u5728\u5934\u4fa7\uff08\u50cf\u5728\u52aa\u529b\u542c\u6216\u770b\u5230\uff09\uff0c\u6216\u7d27\u63e1\u62f3\u5934',
      posture: '\u4e0a\u8eab\u524d\u503e\uff0c\u542b\u80f8\u3001\u5f13\u80cc\u3001\u5f13\u8eab',
      face: '\u7eb1\u7709\uff08\u9f3b\u6881\u4e0a\u65b9\u5f62\u6210\u4e24\u6761\u575a\u76f4\u7ebf\uff09',
    },
  },
  {
    id: 'please_others',
    label: '\u8981\u8ba8\u597d',
    cues: {
      lexicon: '\u5e38\u6709\u9ad8\u4f4e\u8d77\u4f0f\u7684\u5ba2\u6c14\u8868\u8fbe\uff0c\u5982\u201c\u53ef\u4ee5\u5417\uff1f\u884c\u4e86\u5417\uff1f\u201d\u201c\u5dee\u4e0d\u591a\u201d\u201c\u55ef\uff1f\u201d',
      tone: '\u504f\u9ad8\u3001\u53e5\u5b50\u77ed\uff0c\u53e5\u5c3e\u8bed\u8c03\u4e0a\u626c',
      gesture: '\u70b9\u5934\uff0c\u624b\u5f80\u5916\u4f38\uff08\u638c\u5fc3\u5411\u4e0a\uff09',
      posture: '\u80a9\u8180\u524d\u503e\uff0c\u8eab\u4f53\u9760\u5411\u4ed6\u4eba',
      face: '\u62ac\u7709\uff0c\u989d\u5934\u5f62\u6210\u201c\u62ac\u5934\u7eb9\u201d\uff0c\u7b11\u5bb9\u7d27\u5f20\uff0c\u53ef\u89c1\u7259\u9f7f\uff0c\u8138\u90e8\u671d\u4e0b',
    },
  },
  {
    id: 'hurry_up',
    label: '\u8981\u8fc5\u901f',
    cues: {
      lexicon: '\u5e38\u51fa\u73b0\u201c\u6211\u4eec\u5feb\u8d70\uff0c\u5fc5\u987b\u52a0\u901f\uff0c\u5feb\u70b9\uff0c\u6ca1\u65f6\u95f4\u4e86\u201d',
      tone: '\u673a\u5173\u67aa\u5f0f\uff0c\u65ad\u97f3\u3001\u8bcd\u7ec4\u8fde\u53d1',
      gesture: '\u8f7b\u6572\u624b\u6307\uff0c\u6446\u52a8\u53cc\u811a\uff0c\u8e01\u52a8\u8eab\u4f53',
      posture: '\u8e81\u52a8\u4e0d\u5b89\uff0c\u4e0d\u65ad\u53d8\u6362\u59ff\u52bf',
      face: '\u9891\u7e41\u3001\u5feb\u901f\u5730\u79fb\u52a8\u76ee\u5149',
    },
  },
] as const;

const DRIVE_LABEL_MAP = Object.fromEntries(
  DRIVE_OPTIONS.map((item) => [item.id, item.label]),
) as Record<string, string>;

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false);
  const [isPersonPicking, setIsPersonPicking] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [annotationPortalHost, setAnnotationPortalHost] = useState<HTMLElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [speedMenuPosition, setSpeedMenuPosition] = useState<{ left: number; top: number } | null>(null);
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
  const videoSelectRef = useRef<HTMLSelectElement | null>(null);
  const speedButtonRef = useRef<HTMLButtonElement | null>(null);
  const annotationButtonRef = useRef<HTMLButtonElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<Plyr | null>(null);
  const [videoOverlayLayout, setVideoOverlayLayout] = useState<VideoOverlayLayout | null>(null);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedVideoId) ?? null,
    [selectedVideoId, videos],
  );

  useEffect(() => {
    setPersonCandidates([]);
    setSelectedPersonTrackId(null);
    setSelectedPersonBox(null);
    setSelectedPersonTsSec(null);
    setIsPersonPicking(false);
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

  const refreshPlayUrl = useCallback(async () => {
    if (!session || !selectedVideoId) {
      return;
    }
    setLoadingPlayUrl(true);
    setPlayUrlError('');
    const response = await fetch(`/api/videos/${selectedVideoId}/play-url`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    setLoadingPlayUrl(false);
    if (!response.ok || !payload.url) {
      setPlayUrl('');
      setPlayUrlError(payload.error ?? '生成播放链接失败。');
      return;
    }
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
    setAuthMessage('魔法链接已发送，请查收邮箱。');
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

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !playUrl) {
      return;
    }
    let canceled = false;
    let localPlayer: Plyr | null = null;

    void import('plyr').then(({ default: PlyrCtor }) => {
      if (canceled || !videoRef.current) {
        return;
      }
      localPlayer = new PlyrCtor(videoRef.current, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
        settings: [],
        keyboard: { focused: true, global: false },
        clickToPlay: true,
        fullscreen: { enabled: true, fallback: true, iosNative: false },
      });
      localPlayer.speed = videoRef.current.playbackRate;
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
        localPlayer.destroy();
      }
      if (playerRef.current === localPlayer) {
        playerRef.current = null;
      }
      setIsPlayerFullscreen(false);
      setAnnotationPortalHost(null);
    };
  }, [playUrl]);

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
  }, []);

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
      Math.max(0, current - 2),
      current + 2,
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
      backButton.title = '后退 3 秒';
      backButton.setAttribute('aria-label', '后退 3 秒');
      backButton.onclick = () => seekBySeconds(-3);

      const forwardButton = getOrCreateButton('forward');
      forwardButton.textContent = '+3s';
      forwardButton.title = '前进 3 秒';
      forwardButton.setAttribute('aria-label', '前进 3 秒');
      forwardButton.onclick = () => seekBySeconds(3);

      const speedButton = getOrCreateButton('speed');
      speedButton.textContent = '\u23F1';
      speedButton.title = '播放速度';
      speedButton.setAttribute('aria-label', '播放速度');
      speedButton.onclick = () => toggleSpeedMenu();
      speedButton.classList.add('tapa-plyr-extra-btn-icon');

      const annotationButton = getOrCreateButton('annotation');
      annotationButton.innerHTML = TAGS_ICON_SVG;
      annotationButton.title = '打开标注';
      annotationButton.setAttribute('aria-label', '打开标注');
      annotationButton.onclick = () => openAnnotationPanel();
      annotationButton.classList.add('tapa-plyr-extra-btn-icon');
      annotationButton.classList.add('tapa-plyr-extra-btn-icon-svg');
      annotationButton.classList.add('tapa-plyr-extra-btn-primary');
      speedButtonRef.current = speedButton;
      annotationButtonRef.current = annotationButton;
    };

    mountControls();
    return () => {
      canceled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [openAnnotationPanel, playUrl, seekBySeconds, toggleSpeedMenu]);

  const handleAddVideo = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !session) {
      return;
    }
    const title = videoTitle.trim();
    const storageKey = videoStorageKey.trim();
    if (!title || !storageKey) {
      setQueryError('标题和存储 key 必填。');
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
      if (targetId === 'annotation_button') {
        return annotationButtonRef.current;
      }
      if (targetId === 'speed_button') {
        return speedButtonRef.current;
      }
      return null;
    },
    [],
  );

  const markOnboardingAction = (targetId: OnboardingTargetId) => {
    if (!isOnboardingOpen) {
      return;
    }
    if (currentOnboardingStep.targetId !== targetId) {
      return;
    }
    setOnboardingCompletedTargets((current) => ({
      ...current,
      [targetId]: true,
    }));
  };

  useEffect(() => {
    if (!session) {
      return;
    }
    const seen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!seen) {
      const timer = window.setTimeout(() => {
        setOnboardingStepIndex(0);
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
    window.addEventListener('resize', updateOnboardingLayout);
    window.addEventListener('scroll', updateOnboardingLayout, true);
    return () => {
      window.removeEventListener('resize', updateOnboardingLayout);
      window.removeEventListener('scroll', updateOnboardingLayout, true);
    };
  }, [
    currentOnboardingStep.targetId,
    getOnboardingTargetElement,
    isOnboardingOpen,
    isAnnotationOpen,
    isLibraryOpen,
  ]);

  const finishOnboarding = (markAsSeen: boolean) => {
    if (markAsSeen) {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    }
    setIsOnboardingOpen(false);
  };

  const openOnboarding = () => {
    setOnboardingStepIndex(0);
    setOnboardingCompletedTargets({});
    setIsOnboardingOpen(true);
  };

  const goOnboardingNext = () => {
    if (!isCurrentStepActionDone) {
      return;
    }
    if (onboardingStepIndex >= ONBOARDING_STEPS.length - 1) {
      finishOnboarding(true);
      return;
    }
    setOnboardingStepIndex((value) => value + 1);
  };

  const goOnboardingPrev = () => {
    setOnboardingStepIndex((value) => Math.max(0, value - 1));
  };

  const annotationOverlay = isAnnotationOpen ? (
    <div
      className={`fixed inset-0 z-40 flex bg-black/30 ${
        isPlayerFullscreen ? 'items-stretch justify-end p-0' : 'items-end justify-end p-4 md:items-center'
      }`}
    >
      {videoOverlayLayout ? (
        <div className='pointer-events-none fixed inset-0 z-[45]'>
          {isPersonPicking ? (
            <button
              type='button'
              className='pointer-events-auto fixed inset-0'
              aria-label='退出选人模式'
              onClick={() => setIsPersonPicking(false)}
            />
          ) : null}
          {(isPersonPicking
            ? personCandidates
            : personCandidates.filter((candidate) => candidate.trackId === selectedPersonTrackId)
          ).map((candidate) => {
            const selected = candidate.trackId === selectedPersonTrackId;
            return (
              <button
                key={`video-candidate-${candidate.trackId}`}
                type='button'
                className={`pointer-events-auto fixed rounded border-2 ${
                  selected
                    ? 'border-blue-500 bg-blue-500/15'
                    : 'border-emerald-400 bg-emerald-500/12'
                }`}
                style={{
                  left:
                    videoOverlayLayout.viewportLeft +
                    candidate.box.left * videoOverlayLayout.width,
                  top:
                    videoOverlayLayout.viewportTop +
                    candidate.box.top * videoOverlayLayout.height,
                  width: candidate.box.width * videoOverlayLayout.width,
                  height: candidate.box.height * videoOverlayLayout.height,
                }}
                onClick={() => {
                  selectPersonCandidate(candidate);
                  setIsPersonPicking(false);
                }}
                aria-label={'在视频中选择轨迹 ' + candidate.trackId}
                title={'轨迹 ' + candidate.trackId}
              >
                <span
                  className={`absolute left-1 top-1 rounded px-1 text-[10px] font-semibold ${
                    selected ? 'bg-blue-600 text-white' : 'bg-black/70 text-white'
                  }`}
                >
                  {selected ? '已选 #' + candidate.trackId : '#' + candidate.trackId}
                </span>
              </button>
            );
          })}
          {!isPersonPicking && selectedPersonBox ? (
            <div
              className='pointer-events-none fixed rounded border-2 border-blue-500 bg-blue-500/12'
              style={{
                left: videoOverlayLayout.viewportLeft + selectedPersonBox.left * videoOverlayLayout.width,
                top: videoOverlayLayout.viewportTop + selectedPersonBox.top * videoOverlayLayout.height,
                width: selectedPersonBox.width * videoOverlayLayout.width,
                height: selectedPersonBox.height * videoOverlayLayout.height,
              }}
            />
          ) : null}
        </div>
      ) : null}

      {!isPersonPicking ? (
        <section
          className={`relative z-50 w-full border border-zinc-200 bg-white p-5 shadow-2xl ${
            isPlayerFullscreen
              ? 'h-full max-w-md overflow-y-auto rounded-none'
              : 'h-full max-w-xl overflow-y-auto rounded-2xl md:h-auto md:max-h-[90vh] md:overflow-visible'
          }`}
          role='dialog'
          aria-modal='true'
        >
          <div className='mb-3 flex items-center justify-between'>
            <h2 className='text-base font-semibold text-zinc-900'>标注</h2>
            <button
              className='inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
              onClick={() => setIsAnnotationOpen(false)}
              type='button'
              aria-label='关闭'
              title='关闭'
            >
              <IconClose />
            </button>
          </div>

          <form className='space-y-3' onSubmit={handleSubmitAnnotation}>
            <div className='flex flex-wrap gap-2'>
              {DRIVE_OPTIONS.map((driver) => {
                const active = selectedDrivers.includes(driver.id);
                return (
                  <button
                    key={driver.id}
                    type='button'
                    onClick={() => toggleDriver(driver.id)}
                    className={`group relative rounded-full border px-3 py-1.5 text-sm transition ${
                      active
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-zinc-300 text-zinc-800 hover:bg-zinc-50'
                    }`}
                  >
                    <span className='font-medium'>{driver.label}</span>
                    <span className='pointer-events-none absolute left-0 top-full z-[90] mt-2 hidden w-[360px] max-w-[78vw] rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-700 shadow-md group-hover:block'>
                      <span className='grid gap-2'>
                        {CUE_ROWS.map((row) => (
                          <span
                            key={row.key}
                            className='flex items-start gap-2 rounded-lg bg-zinc-50 px-2 py-1.5'
                          >
                            <span className='mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white text-[11px] font-semibold text-zinc-700 shadow-sm'>
                              {row.icon}
                            </span>
                            <span className='leading-5 text-zinc-700'>{driver.cues[row.key]}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className='flex justify-end'>
              <button
                type='button'
                className='rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50'
                disabled={isLoadingPersonCandidates}
                onClick={() => void loadPersonCandidatesForTime(videoRef.current?.currentTime ?? currentVideoTime)}
              >
                {isLoadingPersonCandidates ? '读取中...' : '刷新候选'}
              </button>
            </div>

            {!quickMode ? (
              <label className='text-sm text-zinc-700'>
                评论
                <textarea
                  className='mt-1 h-24 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm'
                  maxLength={MAX_COMMENT_LENGTH}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </label>
            ) : null}

            <div className='flex items-center gap-2'>
              <button
                type='button'
                className={`inline-flex h-10 w-10 items-center justify-center rounded-md border text-zinc-700 ${
                  isPersonPicking ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-zinc-300 hover:bg-zinc-50'
                }`}
                title='选择标注对象'
                aria-label='选择标注对象'
                onClick={() => void startPersonPicking()}
              >
                <IconUserTag />
              </button>
              <button
                className='w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60'
                type='submit'
                disabled={saving || selectedDrivers.length === 0 || !selectedVideoId}
              >
                {saving
                  ? '\u4fdd\u5b58\u4e2d...'
                  : editingAnnotationId
                    ? '\u4fdd\u5b58\u4fee\u6539'
                    : '\u4fdd\u5b58\u6807\u6ce8'}
              </button>
            </div>
            {editingAnnotationId ? (
              <button
                type='button'
                className='text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-700'
                onClick={() => {
                  setEditingAnnotationId(null);
                  setSelectedDrivers([]);
                  setComment('');
                  setOpenAnnotationActionId(null);
                }}
              >
                {'\u53d6\u6d88\u7f16\u8f91'}
              </button>
            ) : null}
          </form>

          {queryError ? (
            <p className='mt-3 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-800'>
              {queryError}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  ) : null;

  if (authLoading) {
    return <main className='mx-auto flex min-h-screen items-center justify-center'>加载中...</main>;
  }

  if (!session) {
    return (
      <main className='mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10'>
        <section className='w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm'>
          <h1 className='text-xl font-semibold text-zinc-900'>驱力行为训练</h1>
          <p className='mt-2 text-sm text-zinc-600'>使用魔法链接登录，登录后会保持会话。</p>
          {!envReady ? (
            <p className='mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-800'>
              缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。
            </p>
          ) : null}
          <form className='mt-4 space-y-3' onSubmit={handleSendMagicLink}>
            <input
              className='w-full rounded-md border border-zinc-300 px-3 py-2 text-sm'
              placeholder='your@email.com'
              type='email'
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button
              className='w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60'
              type='submit'
              disabled={authSending || magicCooldown > 0}
            >
              {authSending ? '发送中...' : magicCooldown > 0 ? magicCooldown + 's 后重试' : '发送魔法链接'}
            </button>
          </form>
          {authMessage ? <p className='mt-3 text-sm text-zinc-700'>{authMessage}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className='min-h-screen bg-zinc-100'>
      <header className='sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur'>
        <div className='mx-auto flex h-14 w-full max-w-[1800px] items-center justify-between px-4'>
          <div className='flex min-w-0 items-center gap-3'>
            <h1 className='whitespace-nowrap text-sm font-semibold tracking-wide text-zinc-900'>驱力训练</h1>
            <select
              ref={videoSelectRef}
              className='w-[240px] max-w-[52vw] truncate rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700'
              value={selectedVideo?.id ?? ''}
              onClick={() => markOnboardingAction('video_select')}
              onChange={(event) => {
                markOnboardingAction('video_select');
                setSelectedVideoId(event.target.value);
              }}
              title='切换视频'
            >
              {videos.length === 0 ? <option value=''>暂无视频</option> : null}
              {videos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.title}
                </option>
              ))}
            </select>
          </div>
          <div className='flex items-center gap-2'>
            <button
              className='inline-flex items-center justify-center rounded-md border border-zinc-300 px-2 py-2 text-zinc-700 hover:bg-zinc-50'
              type='button'
              onClick={() => setIsMyAnnotationsOpen(true)}
              title='我的标注'
              aria-label='我的标注'
            >
              <IconList />
            </button>
            <button
              className='inline-flex items-center justify-center rounded-md border border-zinc-300 px-2 py-2 text-zinc-700 hover:bg-zinc-50'
              type='button'
              onClick={() => setIsMenuOpen(true)}
              title='打开菜单'
              aria-label='打开菜单'
            >
              <IconMenu />
            </button>
          </div>
        </div>
      </header>

      <section className='mx-auto w-full max-w-[1800px] px-4 py-3'>
        <article
            ref={articleRef}
            className='tapa-player-shell relative overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-sm'
          >
          <div>
            {loadingPlayUrl ? (
              <div className='flex h-[calc(100vh-92px)] w-full items-center justify-center text-sm text-zinc-300'>
                正在生成播放链接...
              </div>
            ) : playUrl ? (
              <video
                ref={videoRef}
                src={playUrl}
                playsInline
                preload='metadata'
                onLoadedMetadata={updateVideoOverlayLayout}
                onTimeUpdate={(event) => setCurrentVideoTime(event.currentTarget.currentTime)}
                className='h-[calc(100vh-92px)] w-full bg-black'
              />
            ) : (
              <div className='flex h-[calc(100vh-92px)] w-full items-center justify-center text-sm text-zinc-300'>
                {playUrlError || '暂无可播放链接，请先在视频库选择或新增视频。'}
              </div>
            )}
          </div>

          {!isAnnotationOpen
            ? activePersonAnnotations.map((item) => {
            const box = item.person_box;
            if (!box || !videoOverlayLayout) {
              return null;
            }
            const labels = item.drivers
              .map((driver) => DRIVE_LABEL_MAP[driver] ?? driver)
              .join('、');
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
              })
            : null}
        </article>

      </section>

      {isMyAnnotationsOpen ? (
        <div className='fixed inset-0 z-50 flex bg-black/40' role='dialog' aria-modal='true'>
          <div className='ml-auto h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-base font-semibold text-zinc-900'>\u6211\u7684\u6807\u6ce8</h2>
              <button
                className='inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                onClick={() => {
                  setOpenAnnotationActionId(null);
                  setIsMyAnnotationsOpen(false);
                }}
                type='button'
                aria-label='\u5173\u95ed\u6807\u6ce8\u4fa7\u680f'
                title='\u5173\u95ed\u6807\u6ce8\u4fa7\u680f'
              >
                <IconClose />
              </button>
            </div>
            <p className='mb-3 text-sm text-zinc-600'>\u5f53\u524d\u89c6\u9891\uff1a{selectedVideo?.title ?? '\u672a\u9009\u62e9\u89c6\u9891'}</p>
            <div className='space-y-3'>
              {currentVideoMyAnnotations.length === 0 ? (
                <p className='rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500'>
                  \u5f53\u524d\u89c6\u9891\u8fd8\u6ca1\u6709\u4f60\u7684\u6807\u6ce8
                </p>
              ) : (
                currentVideoMyAnnotations.map((item) => (
                  <article
                    key={item.id}
                    className='group relative cursor-pointer overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md'
                    onClick={() => seekToTime(item.start_sec)}
                    title={`\u8df3\u8f6c\u5230 ${formatSeconds(item.start_sec)}`}
                  >
                    <button
                      type='button'
                      className='absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-sm hover:bg-white'
                      aria-label='\u6807\u6ce8\u64cd\u4f5c\u83dc\u5355'
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenAnnotationActionId((current) => (current === item.id ? null : item.id));
                      }}
                    >
                      <IconMoreVertical />
                    </button>
                    {openAnnotationActionId === item.id ? (
                      <div
                        className='absolute right-2 top-11 z-20 w-28 rounded-md border border-zinc-200 bg-white p-1 shadow-lg'
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type='button'
                          className='block w-full rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100'
                          onClick={() => startEditAnnotation(item)}
                        >
                          {'\u7f16\u8f91'}
                        </button>
                        <button
                          type='button'
                          className='block w-full rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50'
                          onClick={() => void handleDeleteAnnotation(item.id)}
                        >
                          {'\u5220\u9664'}
                        </button>
                      </div>
                    ) : null}
                    {item.thumb_base64 ? (
                      <img
                        src={item.thumb_base64}
                        alt='\u6807\u6ce8\u7f29\u7565\u56fe'
                        className='h-28 w-full object-cover'
                        loading='lazy'
                      />
                    ) : (
                      <div className='flex h-28 w-full items-center justify-center bg-zinc-100 text-xs text-zinc-500'>
                        {'\u65e0\u7f29\u7565\u56fe'}
                      </div>
                    )}
                    <div className='border-t border-zinc-100 px-3 py-2'>
                      <p className='line-clamp-2 text-sm font-medium text-zinc-800'>
                        {item.drivers
                          .map((driver) => DRIVE_LABEL_MAP[driver] ?? driver)
                          .join('\u3001')}
                      </p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isMenuOpen ? (
        <div className='fixed inset-0 z-50 flex bg-black/40' role='dialog' aria-modal='true'>
          <div className='ml-auto h-full w-full max-w-sm overflow-y-auto bg-white p-5 shadow-2xl'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-base font-semibold text-zinc-900'>菜单</h2>
              <button
                className='inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                onClick={() => setIsMenuOpen(false)}
                type='button'
                aria-label='关闭菜单'
                title='关闭菜单'
              >
                <IconClose />
              </button>
            </div>

            <section className='mb-4 rounded-lg border border-zinc-200 p-3'>
              <p className='mb-2 text-xs font-medium text-zinc-600'>模式</p>
              <div className='inline-flex rounded-md border border-zinc-300 p-1'>
                <button
                  type='button'
                  onClick={() => setMode('practice')}
                  className={'rounded px-2 py-1 text-xs ' + (mode === 'practice' ? 'bg-zinc-900 text-white' : 'text-zinc-700')}
                >
                  练习
                </button>
                <button
                  type='button'
                  onClick={() => setMode('supervision')}
                  className={'rounded px-2 py-1 text-xs ' + (mode === 'supervision' ? 'bg-zinc-900 text-white' : 'text-zinc-700')}
                >
                  督导
                </button>
              </div>
              <label className='mt-3 flex items-center gap-2 text-sm text-zinc-700'>
                <input
                  type='checkbox'
                  checked={quickMode}
                  onChange={(event) => setQuickMode(event.target.checked)}
                />
                快速模式
              </label>
            </section>

            <div className='grid gap-2'>
              <button
                className='inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50'
                type='button'
                onClick={() => {
                  setIsMenuOpen(false);
                  void refreshPlayUrl();
                }}
              >
                <IconRefresh />
                刷新播放链接
              </button>
              <button
                className='inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50'
                type='button'
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsLibraryOpen(true);
                }}
              >
                <IconFolder />
                视频库与提交
              </button>
              <button
                className='inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50'
                type='button'
                onClick={() => {
                  setIsMenuOpen(false);
                  openOnboarding();
                }}
              >
                <IconHelp />
                帮助
              </button>
              <button
                className='inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50'
                type='button'
                onClick={handleSignOut}
              >
                <IconSignOut />
                登出
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLibraryOpen ? (
        <div className='fixed inset-0 z-50 flex bg-black/40' role='dialog' aria-modal='true'>
          <div className='ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-lg font-semibold text-zinc-900'>视频库</h2>
              <button
                className='rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50'
                onClick={() => setIsLibraryOpen(false)}
                type='button'
              >
                关闭
              </button>
            </div>
            <label className='text-sm text-zinc-700'>
              选择视频
              <select
                className='mt-1 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm'
                value={selectedVideo?.id ?? ''}
                onChange={(event) => {
                  setSelectedVideoId(event.target.value);
                  setIsLibraryOpen(false);
                }}
              >
                {videos.map((video) => (
                  <option key={video.id} value={video.id}>
                    {video.title} [{video.storage_key ?? '未配置 key'}]
                  </option>
                ))}
              </select>
            </label>

            <div className='my-4 border-t border-zinc-200' />

            <h3 className='text-base font-semibold text-zinc-900'>新增托管视频</h3>
            <form className='mt-3 grid gap-3' onSubmit={handleAddVideo}>
              <input
                className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
                placeholder='标题'
                required
                value={videoTitle}
                onChange={(event) => setVideoTitle(event.target.value)}
              />
              <input
                className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
                placeholder='存储 key，例如 videos/sample-001.mp4'
                required
                value={videoStorageKey}
                onChange={(event) => setVideoStorageKey(event.target.value)}
              />
              <input
                className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
                placeholder='原始来源 URL（可选）'
                value={videoSourceUrl}
                onChange={(event) => setVideoSourceUrl(event.target.value)}
              />
              <button
                className='rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white'
                type='submit'
              >
                保存视频信息
              </button>
            </form>
        </div>
        </div>
      ) : null}

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

      {annotationPortalHost ? createPortal(annotationOverlay, annotationPortalHost) : annotationOverlay}

      {isOnboardingOpen ? (
        <div className='pointer-events-none fixed inset-0 z-[120] p-4' role='dialog' aria-modal='true'>
          {onboardingHighlightRect ? (
            <div
              className='pointer-events-none fixed rounded-xl border-2 border-blue-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]'
              style={{
                top: onboardingHighlightRect.top,
                left: onboardingHighlightRect.left,
                width: onboardingHighlightRect.width,
                height: onboardingHighlightRect.height,
              }}
            />
          ) : (
            <div className='pointer-events-none fixed inset-0 bg-black/55' />
          )}
          <section
            className='pointer-events-auto fixed z-[130] w-[min(440px,calc(100vw-32px))] rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl'
            style={
              onboardingCardPosition
                ? { top: onboardingCardPosition.top, left: onboardingCardPosition.left }
                : undefined
            }
          >
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-base font-semibold text-zinc-900'>首次使用引导</h2>
              <button
                type='button'
                onClick={() => finishOnboarding(true)}
                className='inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                title='关闭引导'
                aria-label='关闭引导'
              >
                <IconClose />
              </button>
            </div>

            <p className='mb-2 text-xs text-zinc-500'>
              第 {onboardingStepIndex + 1} / {ONBOARDING_STEPS.length} 步
            </p>
            <h3 className='text-lg font-semibold text-zinc-900'>{currentOnboardingStep.title}</h3>
            <p className='mt-2 text-sm leading-6 text-zinc-700'>
              {currentOnboardingStep.description}
            </p>
            {currentOnboardingStep.actionHint ? (
              <p className='mt-2 rounded-md bg-blue-50 px-2 py-1.5 text-xs text-blue-700'>
                {currentOnboardingStep.actionHint}
              </p>
            ) : null}

            <div className='mt-5 flex items-center justify-between'>
              <button
                type='button'
                onClick={() => finishOnboarding(true)}
                className='text-sm text-zinc-500 hover:text-zinc-700'
              >
                跳过引导
              </button>
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={goOnboardingPrev}
                  disabled={onboardingStepIndex === 0}
                  className='rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-40'
                >
                  婵犵數鍋為崹鍫曞箰閹间焦鏅濋柨婵嗘川閸楁岸鏌熺紒銏犳灍闁?
                </button>
                <button
                  type='button'
                  onClick={goOnboardingNext}
                  disabled={!isCurrentStepActionDone}
                  className='rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40'
                >
                  {onboardingStepIndex === ONBOARDING_STEPS.length - 1 ? '完成' : '下一步'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}


