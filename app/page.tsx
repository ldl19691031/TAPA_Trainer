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

const DRIVE_OPTIONS = [
  { id: 'be_perfect', label: '\u8981\u5b8c\u7f8e', hint: 'Placeholder: high standards, repeated edits, fear of mistakes.' },
  { id: 'be_strong', label: '\u8981\u575a\u5f3a', hint: 'Placeholder: suppressing vulnerability, carrying alone.' },
  { id: 'try_hard', label: '\u8981\u52aa\u529b\u8bd5', hint: 'Placeholder: continuous effort with less focus.' },
  { id: 'hurry_up', label: '\u8981\u8fc5\u901f', hint: 'Placeholder: fast pace, interruption, rushed transitions.' },
  { id: 'please_others', label: '\u8981\u8ba8\u597d', hint: 'Placeholder: pleasing others, avoiding conflict, seeking approval.' },
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
    return { rows: [], error: 'Cannot read videos table. Please run SQL migration first.' };
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
    return { rows: [], error: `Cannot read annotations table: ${error.message}` };
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

  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
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
    const handleFullscreenChange = () => {
      setIsPlayerFullscreen(document.fullscreenElement === playerContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

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
      setPlayUrlError(payload.error ?? 'Failed to create play URL.');
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

  const setSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleAddVideo = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !session) {
      return;
    }
    const title = videoTitle.trim();
    const storageKey = videoStorageKey.trim();
    if (!title || !storageKey) {
      setQueryError('Title and storage key are required.');
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
      setQueryError(`Create video failed: ${error.message}`);
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
            Login with magic link or Google. Existing session stays signed in.
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
              {authSending ? 'Sending...' : magicCooldown > 0 ? `Retry in ${magicCooldown}s` : 'Send magic link'}
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
      <header className='mb-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'>
        <div>
          <h1 className='text-lg font-semibold text-zinc-900'>Drive behavior trainer</h1>
          <p className='text-sm text-zinc-600'>User: {session.user.email}</p>
        </div>
        <div className='flex items-center gap-2'>
          <button
            className='rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50'
            type='button'
            onClick={() => setIsLibraryOpen(true)}
          >
            Library
          </button>
          <button
            className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
            onClick={handleSignOut}
            type='button'
          >
            Sign out
          </button>
        </div>
      </header>

      <section className='grid gap-4 lg:grid-cols-[1.8fr_1fr]'>
        <article className='rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
            <div>
              <h2 className='text-base font-semibold text-zinc-900'>
                {selectedVideo?.title ?? 'No video selected'}
              </h2>
              {selectedVideo?.source_url ? (
                <p className='text-xs text-zinc-500'>
                  Source:{' '}
                  <a className='underline' href={selectedVideo.source_url} target='_blank' rel='noreferrer'>
                    {selectedVideo.source_url}
                  </a>
                </p>
              ) : null}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <button
                className='rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50'
                type='button'
                onClick={() => void refreshPlayUrl()}
              >
                Refresh URL
              </button>
              <button
                className='rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50'
                type='button'
                onClick={() => void togglePlayerFullscreen()}
              >
                {isPlayerFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              </button>
            </div>
          </div>

          <div
            ref={playerContainerRef}
            className={`overflow-hidden rounded-lg border border-zinc-200 ${isPlayerFullscreen ? 'flex items-center justify-center bg-black p-3' : ''}`}
          >
            {loadingPlayUrl ? (
              <div className='flex h-[480px] w-full items-center justify-center text-sm text-zinc-600'>
                Creating signed URL...
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
                className={isPlayerFullscreen ? 'h-[75vh] w-[95vw] bg-black' : 'h-[480px] w-full bg-black'}
              />
            ) : (
              <div className='flex h-[480px] w-full items-center justify-center text-sm text-zinc-600'>
                {playUrlError || 'No playable URL. Open Library and select/add a video.'}
              </div>
            )}
          </div>

          <div className='mt-3 flex flex-wrap items-center gap-2'>
            <span className='text-sm text-zinc-600'>Speed</span>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <button
                key={rate}
                type='button'
                onClick={() => setSpeed(rate)}
                className={`rounded-md px-3 py-1 text-sm ${
                  playbackRate === rate
                    ? 'bg-zinc-900 text-white'
                    : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </article>

        <aside className='space-y-4'>
          <article className='rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'>
            <div className='mb-2 flex items-center justify-between gap-2'>
              <h2 className='text-base font-semibold text-zinc-900'>Annotation</h2>
              <div className='inline-flex rounded-md border border-zinc-300 p-1'>
                <button
                  type='button'
                  onClick={() => setMode('practice')}
                  className={`rounded px-2 py-1 text-xs ${mode === 'practice' ? 'bg-zinc-900 text-white' : 'text-zinc-700'}`}
                >
                  Practice
                </button>
                <button
                  type='button'
                  onClick={() => setMode('supervision')}
                  className={`rounded px-2 py-1 text-xs ${mode === 'supervision' ? 'bg-zinc-900 text-white' : 'text-zinc-700'}`}
                >
                  Supervision
                </button>
              </div>
            </div>

            <form className='space-y-3' onSubmit={handleSubmitAnnotation}>
              <div className='grid grid-cols-2 gap-2'>
                <label className='text-sm text-zinc-700'>
                  Start
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
                  End
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
                      <span className='ml-2 text-xs text-zinc-500'>(hint)</span>
                      <span className='pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-full rounded-md border border-zinc-200 bg-white p-2 text-xs text-zinc-700 shadow-sm group-hover:block'>
                        {driver.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className='flex items-center gap-2 text-sm text-zinc-700'>
                <input type='checkbox' checked={quickMode} onChange={(event) => setQuickMode(event.target.checked)} />
                Quick mode
              </label>

              {!quickMode ? (
                <label className='text-sm text-zinc-700'>
                  Comment
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
                {saving ? 'Saving...' : 'Save annotation'}
              </button>
            </form>
          </article>

          <article className='rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'>
            <h2 className='mb-2 text-base font-semibold text-zinc-900'>Results</h2>
            {queryError ? (
              <p className='mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-800'>
                {queryError}
              </p>
            ) : null}
            {loadingAnnotations ? <p className='text-sm text-zinc-600'>Loading annotations...</p> : null}

            {mode === 'supervision' ? (
              <div className='space-y-2'>
                {clusters.length === 0 ? (
                  <p className='text-sm text-zinc-600'>No annotation yet.</p>
                ) : (
                  clusters.map((cluster, index) => (
                    <div key={`${cluster.start_sec}-${cluster.end_sec}-${index}`} className='rounded-md border border-zinc-200 p-3'>
                      <p className='text-sm font-medium text-zinc-900'>
                        {formatSeconds(cluster.start_sec)} - {formatSeconds(cluster.end_sec)}
                      </p>
                      <p className='text-xs text-zinc-600'>{cluster.annotations.length} annotations</p>
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
                        {item.drivers.map((driver) => DRIVE_LABEL_MAP[driver] ?? driver).join(', ')}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </article>
        </aside>
      </section>

      {isLibraryOpen ? (
        <div className='fixed inset-0 z-50 flex bg-black/40' role='dialog' aria-modal='true'>
          <div className='ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-lg font-semibold text-zinc-900'>Video Library</h2>
              <button
                className='rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50'
                onClick={() => setIsLibraryOpen(false)}
                type='button'
              >
                Close
              </button>
            </div>

            <label className='text-sm text-zinc-700'>
              Select video
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
                    {video.title} [{video.storage_key ?? 'no-key'}]
                  </option>
                ))}
              </select>
            </label>

            <div className='my-4 border-t border-zinc-200' />

            <h3 className='text-base font-semibold text-zinc-900'>Add hosted video</h3>
            <form className='mt-3 grid gap-3' onSubmit={handleAddVideo}>
              <input
                className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
                placeholder='Title'
                required
                value={videoTitle}
                onChange={(event) => setVideoTitle(event.target.value)}
              />
              <input
                className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
                placeholder='Storage key, e.g. videos/sample-001.mp4'
                required
                value={videoStorageKey}
                onChange={(event) => setVideoStorageKey(event.target.value)}
              />
              <input
                className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
                placeholder='Source URL (optional)'
                value={videoSourceUrl}
                onChange={(event) => setVideoSourceUrl(event.target.value)}
              />
              <button className='rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white' type='submit'>
                Save video metadata
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
