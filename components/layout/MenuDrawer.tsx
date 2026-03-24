import type { ReactNode } from 'react';

type Mode = 'practice' | 'supervision';

type MenuDrawerProps = {
  isOpen: boolean;
  mode: Mode;
  quickMode: boolean;
  closeIcon: ReactNode;
  refreshIcon: ReactNode;
  folderIcon: ReactNode;
  helpIcon: ReactNode;
  signOutIcon: ReactNode;
  onClose: () => void;
  onModeChange: (mode: Mode) => void;
  onQuickModeChange: (checked: boolean) => void;
  onRefreshPlayUrl: () => void;
  onOpenLibrary: () => void;
  onOpenHelp: () => void;
  onSignOut: () => void;
};

export function MenuDrawer({
  isOpen,
  mode,
  quickMode,
  closeIcon,
  refreshIcon,
  folderIcon,
  helpIcon,
  signOutIcon,
  onClose,
  onModeChange,
  onQuickModeChange,
  onRefreshPlayUrl,
  onOpenLibrary,
  onOpenHelp,
  onSignOut,
}: MenuDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className='fixed inset-0 z-50 flex bg-black/40' role='dialog' aria-modal='true'>
      <div className='ml-auto h-full w-full max-w-sm overflow-y-auto bg-white p-5 shadow-2xl'>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-base font-semibold text-zinc-900'>{'\u66f4\u591a\u9009\u9879'}</h2>
          <button
            className='inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
            onClick={onClose}
            type='button'
            aria-label={'\u5173\u95ed\u83dc\u5355'}
            title={'\u5173\u95ed\u83dc\u5355'}
          >
            {closeIcon}
          </button>
        </div>

        <section className='mb-4 rounded-lg border border-zinc-200 p-3'>
          <p className='mb-2 text-xs font-medium text-zinc-600'>{'\u6a21\u5f0f'}</p>
          <div className='inline-flex rounded-md border border-zinc-300 p-1'>
            <button
              type='button'
              onClick={() => onModeChange('practice')}
              className={
                'rounded px-2 py-1 text-xs ' +
                (mode === 'practice' ? 'bg-zinc-900 text-white' : 'text-zinc-700')
              }
            >
              {'\u7ec3\u4e60'}
            </button>
            <button
              type='button'
              onClick={() => onModeChange('supervision')}
              className={
                'rounded px-2 py-1 text-xs ' +
                (mode === 'supervision' ? 'bg-zinc-900 text-white' : 'text-zinc-700')
              }
            >
              {'\u7763\u5bfc'}
            </button>
          </div>
          <label className='mt-3 flex items-center gap-2 text-sm text-zinc-700'>
            <input
              type='checkbox'
              checked={quickMode}
              onChange={(event) => onQuickModeChange(event.target.checked)}
            />
            {'\u5feb\u901f\u6a21\u5f0f'}
          </label>
        </section>

        <div className='grid gap-2'>
          <button
            className='inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50'
            type='button'
            onClick={onRefreshPlayUrl}
          >
            {refreshIcon}
            {'\u5237\u65b0\u64ad\u653e\u94fe\u63a5'}
          </button>
          <button
            className='inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50'
            type='button'
            onClick={onOpenLibrary}
          >
            {folderIcon}
            {'\u89c6\u9891\u5e93\u4e0e\u63d0\u4ea4'}
          </button>
          <button
            className='inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50'
            type='button'
            onClick={onOpenHelp}
          >
            {helpIcon}
            {'\u5e2e\u52a9'}
          </button>
          <button
            className='inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50'
            type='button'
            onClick={onSignOut}
          >
            {signOutIcon}
            {'\u767b\u51fa'}
          </button>
        </div>
      </div>
    </div>
  );
}
