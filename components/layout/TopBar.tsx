import type { RefObject, ReactNode } from 'react';

type TopBarVideo = {
  id: string;
  title: string;
};

type TopBarProps = {
  videos: TopBarVideo[];
  selectedVideoId: string;
  videoSelectRef: RefObject<HTMLSelectElement | null>;
  myAnnotationsButtonRef: RefObject<HTMLButtonElement | null>;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onVideoSelectClick: () => void;
  onVideoChange: (videoId: string) => void;
  onOpenAnnotations: () => void;
  onOpenMenu: () => void;
  annotationsButtonIcon: ReactNode;
  menuButtonIcon: ReactNode;
};

export function TopBar({
  videos,
  selectedVideoId,
  videoSelectRef,
  myAnnotationsButtonRef,
  menuButtonRef,
  onVideoSelectClick,
  onVideoChange,
  onOpenAnnotations,
  onOpenMenu,
  annotationsButtonIcon,
  menuButtonIcon,
}: TopBarProps) {
  return (
    <header className='sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur'>
      <div className='mx-auto flex h-14 w-full max-w-[1800px] items-center justify-between px-4'>
        <div className='flex min-w-0 items-center gap-3'>
          <h1 className='whitespace-nowrap text-sm font-semibold tracking-wide text-zinc-900'>
            {'\u9a71\u529b\u8bad\u7ec3'}
          </h1>
          <select
            ref={videoSelectRef}
            className='w-[240px] max-w-[52vw] truncate rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700'
            value={selectedVideoId}
            onClick={onVideoSelectClick}
            onChange={(event) => onVideoChange(event.target.value)}
            title={'\u5207\u6362\u89c6\u9891'}
          >
            {videos.length === 0 ? <option value=''>{'\u6682\u65e0\u89c6\u9891'}</option> : null}
            {videos.map((video) => (
              <option key={video.id} value={video.id}>
                {video.title}
              </option>
            ))}
          </select>
        </div>
        <div className='flex items-center gap-2'>
          <button
            ref={myAnnotationsButtonRef}
            className='inline-flex items-center justify-center rounded-md border border-zinc-300 px-2 py-2 text-zinc-700 hover:bg-zinc-50'
            type='button'
            onClick={onOpenAnnotations}
            title={'\u6211\u7684\u6807\u6ce8'}
            aria-label={'\u6211\u7684\u6807\u6ce8'}
          >
            {annotationsButtonIcon}
          </button>
          <button
            ref={menuButtonRef}
            className='inline-flex items-center justify-center rounded-md border border-zinc-300 px-2 py-2 text-zinc-700 hover:bg-zinc-50'
            type='button'
            onClick={onOpenMenu}
            title={'\u6253\u5f00\u83dc\u5355'}
            aria-label={'\u6253\u5f00\u83dc\u5355'}
          >
            {menuButtonIcon}
          </button>
        </div>
      </div>
    </header>
  );
}
