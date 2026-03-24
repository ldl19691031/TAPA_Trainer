import type { RefObject, ReactNode } from 'react';

type PlayerSurfaceProps = {
  articleRef: RefObject<HTMLElement | null>;
  playerMountRef: RefObject<HTMLDivElement | null>;
  loadingPlayUrl: boolean;
  playUrl: string;
  playUrlError: string;
  activePersonAnnotations: ReactNode;
  isAnnotationOpen: boolean;
};

export function PlayerSurface({
  articleRef,
  playerMountRef,
  loadingPlayUrl,
  playUrl,
  playUrlError,
  activePersonAnnotations,
  isAnnotationOpen,
}: PlayerSurfaceProps) {
  return (
    <section className='mx-auto w-full max-w-[1800px] px-4 py-3'>
      <article
        ref={articleRef}
        className='tapa-player-shell relative overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-sm'
      >
        <div>
          {loadingPlayUrl ? (
            <div className='flex h-[calc(100vh-92px)] w-full items-center justify-center gap-3 text-sm text-zinc-300'>
              <span className='inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-white' />
              <span>{'视频加载中'}</span>
            </div>
          ) : playUrl ? (
            <div ref={playerMountRef} className='h-[calc(100vh-92px)] w-full bg-black' />
          ) : (
            <div className='flex h-[calc(100vh-92px)] w-full items-center justify-center text-sm text-zinc-300'>
              {playUrlError || '暂无可播放链接，请先在视频库选择或新增视频。'}
            </div>
          )}
        </div>

        {!isAnnotationOpen ? activePersonAnnotations : null}
      </article>
    </section>
  );
}
