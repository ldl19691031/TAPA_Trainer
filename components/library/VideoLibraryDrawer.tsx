import type { FormEvent, ReactNode } from 'react';

type VideoItem = {
  id: string;
  title: string;
  storage_key: string | null;
};

type VideoLibraryDrawerProps = {
  isOpen: boolean;
  videos: VideoItem[];
  selectedVideoId: string;
  videoTitle: string;
  videoStorageKey: string;
  videoSourceUrl: string;
  onClose: () => void;
  onSelectVideo: (videoId: string) => void;
  onTitleChange: (value: string) => void;
  onStorageKeyChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  closeButton?: ReactNode;
};

export function VideoLibraryDrawer({
  isOpen,
  videos,
  selectedVideoId,
  videoTitle,
  videoStorageKey,
  videoSourceUrl,
  onClose,
  onSelectVideo,
  onTitleChange,
  onStorageKeyChange,
  onSourceUrlChange,
  onSubmit,
  closeButton,
}: VideoLibraryDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className='fixed inset-0 z-50 flex bg-black/40' role='dialog' aria-modal='true'>
      <div className='ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl'>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-lg font-semibold text-zinc-900'>{'\u89c6\u9891\u5e93'}</h2>
          {closeButton ?? (
            <button
              className='rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50'
              onClick={onClose}
              type='button'
            >
              {'\u5173\u95ed'}
            </button>
          )}
        </div>
        <label className='text-sm text-zinc-700'>
          {'\u9009\u62e9\u89c6\u9891'}
          <select
            className='mt-1 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm'
            value={selectedVideoId}
            onChange={(event) => onSelectVideo(event.target.value)}
          >
            {videos.map((video) => (
              <option key={video.id} value={video.id}>
                {video.title} [{video.storage_key ?? '\u672a\u914d\u7f6e key'}]
              </option>
            ))}
          </select>
        </label>

        <div className='my-4 border-t border-zinc-200' />

        <h3 className='text-base font-semibold text-zinc-900'>{'\u65b0\u589e\u6258\u7ba1\u89c6\u9891'}</h3>
        <form className='mt-3 grid gap-3' onSubmit={onSubmit}>
          <input
            className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
            placeholder={'\u6807\u9898'}
            required
            value={videoTitle}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <input
            className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
            placeholder={'\u5b58\u50a8 key\uff0c\u4f8b\u5982 videos/sample-001.mp4'}
            required
            value={videoStorageKey}
            onChange={(event) => onStorageKeyChange(event.target.value)}
          />
          <input
            className='rounded-md border border-zinc-300 px-3 py-2 text-sm'
            placeholder={'\u539f\u59cb\u6765\u6e90 URL\uff08\u53ef\u9009\uff09'}
            value={videoSourceUrl}
            onChange={(event) => onSourceUrlChange(event.target.value)}
          />
          <button
            className='rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white'
            type='submit'
          >
            {'\u4fdd\u5b58\u89c6\u9891\u4fe1\u606f'}
          </button>
        </form>
      </div>
    </div>
  );
}
