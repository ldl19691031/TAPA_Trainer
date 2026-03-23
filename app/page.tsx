'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

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
  created_at: string;
};

type MergeCluster = {
  start_sec: number;
  end_sec: number;
  annotations: AnnotationRow[];
  driverCount: Record<string, number>;
};

const MIN_SEGMENT_SECONDS = 2;
const SNAP_STEP_SECONDS = 0.5;
const MERGE_THRESHOLD = 0.5;
const MAX_COMMENT_LENGTH = 1000;

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

function IconAnnotation() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-5 w-5'>
      <path
        d='M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3v-5.5A8.5 8.5 0 1 1 21 11.5zM12 8v7M8.5 11.5h7'
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

function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function normalizeSegment(start: number, end: number): { start: number; end: number } {
  const snappedStart = Math.max(0, snapToStep(start, SNAP_STEP_SECONDS));
  const snappedEnd = Math.max(0, snapToStep(end, SNAP_STEP_SECONDS));
  const adjustedEnd =
    snappedEnd - snappedStart >= MIN_SEGMENT_SECONDS
      ? snappedEnd
      : snapToStep(snappedStart + MIN_SEGMENT_SECONDS, SNAP_STEP_SECONDS);
  return { start: snappedStart, end: adjustedEnd };
}

function overlapRatio(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  if (overlap <= 0) {
    return 0;
  }
  const base = Math.max(0.0001, Math.min(aEnd - aStart, bEnd - bStart));
  return overlap / base;
}

function buildMergeClusters(rows: AnnotationRow[]): MergeCluster[] {
  const sorted = [...rows].sort((a, b) => a.start_sec - b.start_sec);
  const clusters: MergeCluster[] = [];
  for (const row of sorted) {
    const match = clusters.find((cluster) => {
      return (
        overlapRatio(row.start_sec, row.end_sec, cluster.start_sec, cluster.end_sec) >=
        MERGE_THRESHOLD
      );
    });
    if (!match) {
      const driverCount: Record<string, number> = {};
      for (const driver of row.drivers) {
        driverCount[driver] = (driverCount[driver] ?? 0) + 1;
      }
      clusters.push({
        start_sec: row.start_sec,
        end_sec: row.end_sec,
        annotations: [row],
        driverCount,
      });
      continue;
    }
    match.start_sec = Math.min(match.start_sec, row.start_sec);
    match.end_sec = Math.max(match.end_sec, row.end_sec);
    match.annotations.push(row);
    for (const driver of row.drivers) {
      match.driverCount[driver] = (match.driverCount[driver] ?? 0) + 1;
    }
  }
  return clusters.sort((a, b) => a.start_sec - b.start_sec);
}

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  const tenths = Math.round((value - Math.floor(value)) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

async function loadVideos(supabase: SupabaseClient): Promise<{ rows: VideoRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('videos')
    .select('id,title,storage_key,source_url,created_by,created_at')
    .order('created_at', { ascending: false });
  if (error) {
    return { rows: [], error: '无法读取 videos 表，请先执行 SQL migration。' };
  }
  return { rows: (data ?? []) as VideoRow[], error: null };
}

async function loadAnnotations(
  supabase: SupabaseClient,
  videoId: string,
): Promise<{ rows: AnnotationRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('annotations')
    .select('id,video_id,user_id,start_sec,end_sec,drivers,comment,created_at')
    .eq('video_id', videoId)
    .order('start_sec', { ascending: true });
  if (error) {
    return { rows: [], error: `读取 annotations 表失败：${error.message}` };
  }
  return { rows: (data ?? []) as AnnotationRow[], error: null };
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

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedVideoId) ?? null,
    [selectedVideoId, videos],
  );

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
      setAuthMessage(`发送失败：${error.message}`);
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

  const setSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setIsSpeedMenuOpen(false);
  };

  const openAnnotationPanel = () => {
    const current = videoRef.current?.currentTime ?? 0;
    const normalized = normalizeSegment(Math.max(0, current - 2), current + 2);
    setSegmentStart(normalized.start);
    setSegmentEnd(normalized.end);
    setIsAnnotationOpen(true);
  };

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
      setQueryError(`创建视频失败：${error.message}`);
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

  const handleSubmitAnnotation = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !session || !selectedVideo) {
      return;
    }
    if (selectedDrivers.length === 0) {
      setQueryError('至少选择一个驱力。');
      return;
    }
    const normalized = normalizeSegment(segmentStart, segmentEnd);
    setSaving(true);
    const { error } = await supabase.from('annotations').insert({
      video_id: selectedVideo.id,
      start_sec: normalized.start,
      end_sec: normalized.end,
      drivers: selectedDrivers,
      comment: quickMode ? null : comment.trim() || null,
    });
    setSaving(false);
    if (error) {
      setQueryError(`保存标注失败：${error.message}`);
      return;
    }
    setSegmentStart(normalized.start);
    setSegmentEnd(normalized.end + MIN_SEGMENT_SECONDS);
    setSelectedDrivers([]);
    setComment('');
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

  const clusters = useMemo(
    () => (mode === 'supervision' ? buildMergeClusters(visibleAnnotations) : []),
    [mode, visibleAnnotations],
  );

  if (authLoading) {
    return <main className='mx-auto flex min-h-screen items-center justify-center'>加载中...</main>;
  }

  if (!session) {
    return (
      <main className='mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10'>
        <section className='w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm'>
          <h1 className='text-xl font-semibold text-zinc-900'>驱力行为训练</h1>
          <p className='mt-2 text-sm text-zinc-600'>使用魔法链接登录，已登录会保持会话。</p>
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
              {authSending ? '发送中...' : magicCooldown > 0 ? `${magicCooldown}s 后重试` : '发送魔法链接'}
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
              className='w-[240px] max-w-[52vw] truncate rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700'
              value={selectedVideo?.id ?? ''}
              onChange={(event) => setSelectedVideoId(event.target.value)}
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
              className='inline-flex items-center justify-center rounded-md px-2 py-2 text-zinc-700 hover:bg-zinc-100'
              type='button'
              onClick={() => void refreshPlayUrl()}
              title='刷新播放链接'
              aria-label='刷新播放链接'
            >
              <IconRefresh />
            </button>
            <button
              className='inline-flex items-center justify-center rounded-md px-2 py-2 text-zinc-700 hover:bg-zinc-100'
              type='button'
              onClick={() => setIsLibraryOpen(true)}
              title='视频库'
              aria-label='视频库'
            >
              <IconFolder />
            </button>
            <button
              className='inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50'
              type='button'
              onClick={handleSignOut}
            >
              <IconSignOut />
              <span className='hidden sm:inline'>退出</span>
            </button>
          </div>
        </div>
      </header>

      <section className='mx-auto w-full max-w-[1800px] px-4 py-3'>
        <article className='relative overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-sm'>
          <div>
            {loadingPlayUrl ? (
              <div className='flex h-[calc(100vh-92px)] w-full items-center justify-center text-sm text-zinc-300'>
                正在生成播放链接...
              </div>
            ) : playUrl ? (
              <video
                ref={videoRef}
                src={playUrl}
                controls
                playsInline
                preload='metadata'
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    videoRef.current.playbackRate = playbackRate;
                  }
                }}
                className='h-[calc(100vh-92px)] w-full bg-black'
              />
            ) : (
              <div className='flex h-[calc(100vh-92px)] w-full items-center justify-center text-sm text-zinc-300'>
                {playUrlError || '暂无可播放链接，请先在视频库选择或新增视频。'}
              </div>
            )}
          </div>

          <div className='pointer-events-none absolute bottom-[calc(188px+env(safe-area-inset-bottom))] right-5 z-20 flex flex-col items-end gap-2'>
            <div className='pointer-events-auto relative'>
              <button
                type='button'
                onClick={() => setIsSpeedMenuOpen((value) => !value)}
                className='rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-zinc-800 shadow-md hover:bg-white'
              >
                {playbackRate}x
              </button>
              {isSpeedMenuOpen ? (
                <div className='absolute bottom-12 right-0 w-28 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg'>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      type='button'
                      onClick={() => setSpeed(rate)}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                        playbackRate === rate ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type='button'
              onClick={openAnnotationPanel}
              className='pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-blue-700'
            >
              <IconAnnotation />
              标注
            </button>
          </div>
        </article>
      </section>

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
              <button className='rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white' type='submit'>
                保存视频信息
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {isAnnotationOpen ? (
        <div className='fixed inset-0 z-40 flex items-end justify-end bg-black/30 p-4 md:items-center'>
          <section className='h-full w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl md:h-auto md:max-h-[90vh] md:overflow-visible' role='dialog' aria-modal='true'>
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

            <div className='mb-3 inline-flex rounded-md border border-zinc-300 p-1'>
              <button
                type='button'
                onClick={() => setMode('practice')}
                className={`rounded px-2 py-1 text-xs ${mode === 'practice' ? 'bg-zinc-900 text-white' : 'text-zinc-700'}`}
              >
                练习
              </button>
              <button
                type='button'
                onClick={() => setMode('supervision')}
                className={`rounded px-2 py-1 text-xs ${mode === 'supervision' ? 'bg-zinc-900 text-white' : 'text-zinc-700'}`}
              >
                督导
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
                        active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-zinc-300 text-zinc-800 hover:bg-zinc-50'
                      }`}
                    >
                      <span className='font-medium'>{driver.label}</span>
                      <span className='pointer-events-none absolute left-0 top-full z-[90] mt-2 hidden w-[360px] max-w-[78vw] rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-700 shadow-md group-hover:block'>
                        <span className='grid gap-2'>
                          {CUE_ROWS.map((row) => (
                            <span key={row.key} className='flex items-start gap-2 rounded-lg bg-zinc-50 px-2 py-1.5'>
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

              <label className='flex items-center gap-2 text-sm text-zinc-700'>
                <input type='checkbox' checked={quickMode} onChange={(event) => setQuickMode(event.target.checked)} />
                快速模式
              </label>

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

              <button
                className='w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60'
                type='submit'
                disabled={saving || selectedDrivers.length === 0 || !selectedVideoId}
              >
                {saving ? '保存中...' : '保存标注'}
              </button>

              <details
                className='rounded-lg border border-zinc-200 bg-zinc-50/80 p-2'
                open={isDetailsOpen}
                onToggle={(event) => setIsDetailsOpen(event.currentTarget.open)}
              >
                <summary className='cursor-pointer select-none text-sm font-medium text-zinc-700'>
                  时间与近期标注
                </summary>
                <div className='mt-2 space-y-2'>
                  <div className='grid grid-cols-2 gap-2'>
                    <label className='text-xs text-zinc-500'>
                      开始
                      <input
                        type='number'
                        min={0}
                        step={SNAP_STEP_SECONDS}
                        value={segmentStart}
                        onChange={(event) => setSegmentStart(Number(event.target.value))}
                        className='mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700'
                      />
                    </label>
                    <label className='text-xs text-zinc-500'>
                      结束
                      <input
                        type='number'
                        min={0}
                        step={SNAP_STEP_SECONDS}
                        value={segmentEnd}
                        onChange={(event) => setSegmentEnd(Number(event.target.value))}
                        className='mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700'
                      />
                    </label>
                  </div>
                  <p className='text-xs text-zinc-500'>
                    默认取当前播放时间前后 2 秒，并按 {SNAP_STEP_SECONDS}s 对齐，最短 {MIN_SEGMENT_SECONDS}s。
                  </p>
                  {loadingAnnotations ? <p className='text-xs text-zinc-500'>加载标注中...</p> : null}
                  {mode === 'supervision' ? (
                    <div className='space-y-1.5'>
                      {clusters.length === 0 ? (
                        <p className='text-xs text-zinc-500'>暂无标注。</p>
                      ) : (
                        clusters.slice(0, 8).map((cluster, index) => (
                          <div key={`${cluster.start_sec}-${cluster.end_sec}-${index}`} className='rounded-md border border-zinc-200 bg-white p-2'>
                            <p className='text-xs font-medium text-zinc-900'>
                              {formatSeconds(cluster.start_sec)} - {formatSeconds(cluster.end_sec)}
                            </p>
                            <p className='text-xs text-zinc-600'>{cluster.annotations.length} 条标注</p>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className='space-y-1.5'>
                      {visibleAnnotations.length === 0 ? (
                        <p className='text-xs text-zinc-500'>你还没有标注。</p>
                      ) : (
                        visibleAnnotations.slice(0, 8).map((item) => (
                          <div key={item.id} className='rounded-md border border-zinc-200 bg-white p-2'>
                            <p className='text-xs font-medium text-zinc-900'>
                              {formatSeconds(item.start_sec)} - {formatSeconds(item.end_sec)}
                            </p>
                            <p className='text-xs text-zinc-700'>
                              {item.drivers.map((driver) => DRIVE_LABEL_MAP[driver] ?? driver).join('、')}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </details>
            </form>

            {queryError ? (
              <p className='mt-3 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-800'>
                {queryError}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

