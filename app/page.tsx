'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

type Mode = 'practice' | 'supervision';
type VideoProvider = 'youtube' | 'bilibili';

type VideoRow = {
  id: string;
  title: string;
  provider: VideoProvider;
  embed_url: string;
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

const DRIVE_OPTIONS = [
  {
    id: 'be_perfect',
    label: '\u8981\u5b8c\u7f8e',
    hint: 'Placeholder: high standards, repeated edits, fear of mistakes.',
  },
  {
    id: 'be_strong',
    label: '\u8981\u575a\u5f3a',
    hint: 'Placeholder: suppressing vulnerability, carrying alone.',
  },
  {
    id: 'try_hard',
    label: '\u8981\u52aa\u529b\u8bd5',
    hint: 'Placeholder: continuous effort with less focus.',
  },
  {
    id: 'hurry_up',
    label: '\u8981\u8fc5\u901f',
    hint: 'Placeholder: fast pace, interruption, rushed transitions.',
  },
  {
    id: 'please_others',
    label: '\u8981\u8ba8\u597d',
    hint: 'Placeholder: pleasing others, avoiding conflict, seeking approval.',
  },
] as const;

const DRIVE_LABEL_MAP = Object.fromEntries(
  DRIVE_OPTIONS.map((item) => [item.id, item.label]),
) as Record<string, string>;

const DEFAULT_BILIBILI_EMBED =
  'https://player.bilibili.com/player.html?isOutside=true&aid=114897304228587&bvid=BV1UEgWz9EBE&cid=31212832462&p=1';

const defaultVideo: VideoRow = {
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Starter sample (Bilibili)',
  provider: 'bilibili',
  embed_url: DEFAULT_BILIBILI_EMBED,
  created_by: 'system',
  created_at: '1970-01-01T00:00:00.000Z',
};

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
        overlapRatio(row.start_sec, row.end_sec, cluster.start_sec, cluster.end_sec) >= MERGE_THRESHOLD
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

function parseVideoInput(input: string): { provider: VideoProvider; embedUrl: string } | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const iframeMatch = trimmed.match(/src=['"]([^'"]+)['"]/i);
  const extracted = iframeMatch ? iframeMatch[1] : trimmed;
  const maybeProtocolLess = extracted.startsWith('//') ? `https:${extracted}` : extracted;

  if (maybeProtocolLess.includes('player.bilibili.com/player.html')) {
    return { provider: 'bilibili', embedUrl: maybeProtocolLess };
  }

  const bvidMatch = maybeProtocolLess.match(/BV[0-9A-Za-z]+/);
  if (bvidMatch) {
    return {
      provider: 'bilibili',
      embedUrl: `https://player.bilibili.com/player.html?isOutside=true&bvid=${bvidMatch[0]}&p=1`,
    };
  }

  try {
    const url = new URL(maybeProtocolLess);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.replace('/', '');
      if (id) {
        return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${id}` };
      }
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = url.searchParams.get('v');
      if (id) {
        return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${id}` };
      }
      const shortsMatch = url.pathname.match(/\/shorts\/([^/]+)/);
      if (shortsMatch?.[1]) {
        return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${shortsMatch[1]}` };
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function loadVideos(supabase: SupabaseClient): Promise<{ rows: VideoRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('videos')
    .select('id,title,provider,embed_url,created_by,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return { rows: [defaultVideo], error: 'Cannot read videos table. Please run SQL setup first.' };
  }

  const rows = (data ?? []) as VideoRow[];
  if (rows.length === 0) {
    return { rows: [defaultVideo], error: null };
  }
  return { rows, error: null };
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
    return { rows: [], error: 'Cannot read annotations table. Please run SQL setup first.' };
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

  const [videos, setVideos] = useState<VideoRow[]>([defaultVideo]);
  const [selectedVideoId, setSelectedVideoId] = useState(defaultVideo.id);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoInput, setVideoInput] = useState(DEFAULT_BILIBILI_EMBED);

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
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedVideoId) ?? videos[0],
    [selectedVideoId, videos],
  );

  useEffect(() => {
    if (!supabase) {
      const timer = window.setTimeout(() => setAuthLoading(false), 0);
      return () => {
        window.clearTimeout(timer);
      };
    }

    if (!envReady) {
      return;
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
  }, [envReady, supabase]);

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
        result.rows.some((item) => item.id === current) ? current : result.rows[0].id,
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
    const handleFullscreenChange = () => {
      setIsPlayerFullscreen(document.fullscreenElement === playerContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleSendMagicLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage('Missing Supabase env vars.');
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
      setAuthMessage(`Failed to send: ${error.message}`);
      setAuthSending(false);
      return;
    }

    setMagicCooldown(30);
    setAuthMessage('Magic link sent. Please check your inbox.');
    setAuthSending(false);
  };

  const handleGoogleLogin = async () => {
    if (!supabase || authSending) {
      return;
    }
    setAuthMessage('');
    setAuthSending(true);
    const redirectTo =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== 'undefined' ? window.location.origin : undefined);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      setAuthMessage(`Google sign-in failed: ${error.message}`);
      setAuthSending(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setSession(null);
    setAnnotations([]);
  };

  const togglePlayerFullscreen = async () => {
    const container = playerContainerRef.current;
    if (!container) {
      return;
    }

    if (document.fullscreenElement === container) {
      await document.exitFullscreen();
      return;
    }
    await container.requestFullscreen();
  };

  const handleAddVideo = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !session) {
      return;
    }

    const parsed = parseVideoInput(videoInput);
    if (!parsed) {
      setQueryError('Unsupported URL. Only YouTube/Bilibili are allowed.');
      return;
    }

    const title = videoTitle.trim() || 'Untitled video';
    const { data, error } = await supabase
      .from('videos')
      .insert({ title, provider: parsed.provider, embed_url: parsed.embedUrl })
      .select('id,title,provider,embed_url,created_by,created_at')
      .single();

    if (error) {
      setQueryError(`Create video failed: ${error.message}`);
      return;
    }

    const row = data as VideoRow;
    setVideos((current) => [row, ...current.filter((item) => item.id !== row.id)]);
    setSelectedVideoId(row.id);
    setVideoTitle('');
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
      setQueryError('Select at least one driver.');
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
      setQueryError(`Save annotation failed: ${error.message}`);
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
    return <main className='mx-auto flex min-h-screen items-center justify-center'>Loading...</main>;
  }

  if (!session) {
    return (
      <main className='mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10'>
        <section className='w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm'>
          <h1 className='text-xl font-semibold text-zinc-900'>Drive behavior trainer</h1>
          <p className='mt-2 text-sm text-zinc-600'>
            Login with magic link or Google. Existing session will stay signed in.
          </p>
          {!envReady ? (
            <p className='mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-800'>
              Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
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
              {authSending
                ? 'Sending...'
                : magicCooldown > 0
                  ? `Retry in ${magicCooldown}s`
                  : 'Send magic link'}
            </button>
          </form>
          <button
            className='mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 disabled:opacity-60'
            type='button'
            onClick={handleGoogleLogin}
            disabled={authSending}
          >
            Continue with Google
          </button>
          {authMessage ? <p className='mt-3 text-sm text-zinc-700'>{authMessage}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className='mx-auto min-h-screen w-full max-w-7xl px-4 py-6'>
      <header className='mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'>
        <div>
          <h1 className='text-lg font-semibold text-zinc-900'>Drive behavior trainer</h1>
          <p className='text-sm text-zinc-600'>
            User: {session.user.email} | min {MIN_SEGMENT_SECONDS}s | snap {SNAP_STEP_SECONDS}s | merge {Math.round(MERGE_THRESHOLD * 100)}%
          </p>
        </div>
        <button className='rounded-md border border-zinc-300 px-3 py-2 text-sm' onClick={handleSignOut} type='button'>
          Sign out
        </button>
      </header>

      <section className='grid gap-4 lg:grid-cols-[1.5fr_1fr]'>
        <div className='space-y-4'>
          <article className='rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'>
            <div className='mb-3 flex flex-wrap items-center gap-2'>
              <label className='text-sm text-zinc-600' htmlFor='video-select'>Current video</label>
              <select
                className='min-w-[240px] rounded-md border border-zinc-300 px-2 py-1 text-sm'
                id='video-select'
                value={selectedVideo?.id ?? ''}
                onChange={(event) => setSelectedVideoId(event.target.value)}
              >
                {videos.map((video) => (
                  <option key={video.id} value={video.id}>
                    [{video.provider}] {video.title}
                  </option>
                ))}
              </select>
              <button
                className='rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50'
                type='button'
                onClick={() => void togglePlayerFullscreen()}
              >
                {isPlayerFullscreen ? 'Exit fullscreen' : 'Fullscreen player'}
              </button>
            </div>
            {selectedVideo ? (
              <div
                ref={playerContainerRef}
                className={`overflow-hidden rounded-lg border border-zinc-200 ${
                  isPlayerFullscreen ? 'flex items-center justify-center bg-black p-3' : ''
                }`}
              >
                <iframe
                  src={selectedVideo.embed_url}
                  title={selectedVideo.title}
                  className={isPlayerFullscreen ? 'h-[75vh] w-[95vw]' : 'h-[420px] w-full'}
                  allowFullScreen
                />
              </div>
            ) : null}
            <p className='mt-2 text-xs text-zinc-500'>
              Note: embedded Bilibili player controls are limited by platform policy. For stable pause/slow-play,
              prefer YouTube embed or videos you own with custom player support.
            </p>
          </article>

          <article className='rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'>
            <h2 className='text-base font-semibold text-zinc-900'>Add video (YouTube/Bilibili)</h2>
            <form className='mt-3 grid gap-3 md:grid-cols-[1fr_2fr_auto]' onSubmit={handleAddVideo}>
              <input
                className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
                placeholder='Optional title'
                value={videoTitle}
                onChange={(event) => setVideoTitle(event.target.value)}
              />
              <input
                className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
                placeholder='Paste iframe / YouTube URL / Bilibili URL'
                required
                value={videoInput}
                onChange={(event) => setVideoInput(event.target.value)}
              />
              <button className='rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white' type='submit'>Save</button>
            </form>
          </article>
        </div>

        <div className='space-y-4'>
          <article className='rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'>
            <h2 className='text-base font-semibold text-zinc-900'>Annotation</h2>
            <form className='mt-3 space-y-3' onSubmit={handleSubmitAnnotation}>
              <div className='grid grid-cols-2 gap-2'>
                <label className='text-sm text-zinc-700'>
                  Start sec
                  <input
                    type='number'
                    min={0}
                    step={SNAP_STEP_SECONDS}
                    value={segmentStart}
                    onChange={(event) => setSegmentStart(Number(event.target.value))}
                    className='mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm'
                  />
                </label>
                <label className='text-sm text-zinc-700'>
                  End sec
                  <input
                    type='number'
                    min={0}
                    step={SNAP_STEP_SECONDS}
                    value={segmentEnd}
                    onChange={(event) => setSegmentEnd(Number(event.target.value))}
                    className='mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm'
                  />
                </label>
              </div>

              <div className='text-xs text-zinc-600'>Segment is normalized to min duration and snap step automatically.</div>

              <div className='grid grid-cols-1 gap-2'>
                {DRIVE_OPTIONS.map((driver) => {
                  const active = selectedDrivers.includes(driver.id);
                  return (
                    <button
                      key={driver.id}
                      type='button'
                      onClick={() => toggleDriver(driver.id)}
                      className={`group relative rounded-md border px-3 py-2 text-left text-sm transition ${
                        active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-zinc-300 text-zinc-800 hover:bg-zinc-50'
                      }`}
                    >
                      <span className='font-medium'>{driver.label}</span>
                      <span className='ml-2 text-xs text-zinc-500'>(hover for hint)</span>
                      <span className='pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-full rounded-md border border-zinc-200 bg-white p-2 text-xs text-zinc-700 shadow-sm group-hover:block'>
                        {driver.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className='flex items-center gap-2 text-sm text-zinc-700'>
                <input type='checkbox' checked={quickMode} onChange={(event) => setQuickMode(event.target.checked)} />
                Quick mode (driver only)
              </label>

              {!quickMode ? (
                <label className='text-sm text-zinc-700'>
                  Comment (optional)
                  <textarea
                    className='mt-1 h-24 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm'
                    maxLength={MAX_COMMENT_LENGTH}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </label>
              ) : null}

              <button className='w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60' type='submit' disabled={saving || selectedDrivers.length === 0}>
                {saving ? 'Saving...' : 'Save annotation'}
              </button>
            </form>
          </article>

          <article className='rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'>
            <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
              <h2 className='text-base font-semibold text-zinc-900'>Mode</h2>
              <div className='inline-flex rounded-md border border-zinc-300 p-1'>
                <button
                  type='button'
                  onClick={() => setMode('practice')}
                  className={`rounded px-3 py-1 text-sm ${mode === 'practice' ? 'bg-zinc-900 text-white' : 'text-zinc-700'}`}
                >
                  Practice
                </button>
                <button
                  type='button'
                  onClick={() => setMode('supervision')}
                  className={`rounded px-3 py-1 text-sm ${mode === 'supervision' ? 'bg-zinc-900 text-white' : 'text-zinc-700'}`}
                >
                  Supervision
                </button>
              </div>
            </div>

            {queryError ? <p className='mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-800'>{queryError}</p> : null}
            {loadingAnnotations ? <p className='text-sm text-zinc-600'>Loading annotations...</p> : null}

            {mode === 'supervision' ? (
              <div className='space-y-3'>
                <p className='text-xs text-zinc-600'>Merged clusters tolerate timing drift across users.</p>
                {clusters.length === 0 ? (
                  <p className='text-sm text-zinc-600'>No annotation yet.</p>
                ) : (
                  clusters.map((cluster, index) => (
                    <div key={`${cluster.start_sec}-${cluster.end_sec}-${index}`} className='rounded-md border border-zinc-200 p-3'>
                      <p className='text-sm font-medium text-zinc-900'>
                        Segment {formatSeconds(cluster.start_sec)} - {formatSeconds(cluster.end_sec)}
                      </p>
                      <p className='text-xs text-zinc-600'>{cluster.annotations.length} annotations</p>
                      <p className='mt-1 text-xs text-zinc-700'>
                        Drivers:{' '}
                        {Object.entries(cluster.driverCount)
                          .sort((a, b) => b[1] - a[1])
                          .map(([driver, count]) => `${DRIVE_LABEL_MAP[driver] ?? driver} x${count}`)
                          .join(', ') || 'none'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className='space-y-2'>
                {visibleAnnotations.length === 0 ? (
                  <p className='text-sm text-zinc-600'>You have no annotation yet.</p>
                ) : (
                  visibleAnnotations.map((item) => (
                    <div key={item.id} className='rounded-md border border-zinc-200 p-3'>
                      <p className='text-sm font-medium text-zinc-900'>
                        {formatSeconds(item.start_sec)} - {formatSeconds(item.end_sec)}
                      </p>
                      <p className='text-xs text-zinc-700'>
                        Drivers: {item.drivers.map((driver) => DRIVE_LABEL_MAP[driver] ?? driver).join(', ')}
                      </p>
                      {item.comment ? <p className='mt-1 text-xs text-zinc-600'>Comment: {item.comment}</p> : null}
                    </div>
                  ))
                )}
              </div>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}
