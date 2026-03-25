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
        {playUrl ? (
          <div ref={playerMountRef} className='h-[calc(100vh-92px)] w-full bg-black' />
        ) : (
          <div className='flex h-[calc(100vh-92px)] w-full items-center justify-center text-sm text-zinc-300'>
            {playUrlError || '??????????????????????'}
          </div>
        )}

        {loadingPlayUrl ? (
          <div className='absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[1px]'>
            <div className='inline-flex items-center gap-3 rounded-full bg-black/55 px-4 py-2 text-sm text-zinc-100 shadow-lg'>
              <span className='inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-white' />
              <span>{'?????'}</span>
            </div>
          </div>
        ) : null}

        {!isAnnotationOpen ? activePersonAnnotations : null}
      </article>
    </section>
  );
}
