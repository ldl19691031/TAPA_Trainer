import type { ReactNode, RefObject } from 'react';

type AnnotationListItem = {
  id: string;
  start_sec: number;
  drivers: string[];
  thumb_base64: string | null;
};

type MyAnnotationsDrawerProps = {
  isOpen: boolean;
  selectedVideoTitle: string;
  annotations: AnnotationListItem[];
  firstCardRef: RefObject<HTMLElement | null>;
  firstActionButtonRef: RefObject<HTMLButtonElement | null>;
  openActionId: string | null;
  hoveredActionId: string | null;
  driverLabelMap: Record<string, string>;
  closeIcon: ReactNode;
  moreIcon: ReactNode;
  onClose: () => void;
  onCardClick: (annotationId: string, startSec: number) => void;
  onActionHover: (annotationId: string | null) => void;
  onActionToggle: (annotationId: string) => void;
  onEdit: (annotationId: string) => void;
  onDelete: (annotationId: string) => void;
  onDismissActionMenu: () => void;
  formatSeconds: (value: number) => string;
};

export function MyAnnotationsDrawer({
  isOpen,
  selectedVideoTitle,
  annotations,
  firstCardRef,
  firstActionButtonRef,
  openActionId,
  hoveredActionId,
  driverLabelMap,
  closeIcon,
  moreIcon,
  onClose,
  onCardClick,
  onActionHover,
  onActionToggle,
  onEdit,
  onDelete,
  onDismissActionMenu,
  formatSeconds,
}: MyAnnotationsDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className='fixed inset-0 z-50 flex bg-black/40' role='dialog' aria-modal='true'>
      <div
        className='ml-auto h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl'
        onClick={onDismissActionMenu}
      >
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-base font-semibold text-zinc-900'>{'\u6211\u7684\u6807\u6ce8'}</h2>
          <button
            className='inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
            onClick={onClose}
            type='button'
            aria-label={'\u5173\u95ed\u6807\u6ce8\u4fa7\u680f'}
            title={'\u5173\u95ed\u6807\u6ce8\u4fa7\u680f'}
          >
            {closeIcon}
          </button>
        </div>
        <p className='mb-3 text-sm text-zinc-600'>
          {'\u5f53\u524d\u89c6\u9891\uff1a'}
          {selectedVideoTitle}
        </p>
        <div className='space-y-3'>
          {annotations.length === 0 ? (
            <p className='rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500'>
              {'\u5f53\u524d\u89c6\u9891\u8fd8\u6ca1\u6709\u4f60\u7684\u6807\u6ce8\u3002'}
            </p>
          ) : (
            annotations.map((item, index) => (
              <article
                ref={index === 0 ? firstCardRef : null}
                key={item.id}
                className='group relative cursor-pointer overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md'
                onClick={(event) => {
                  event.stopPropagation();
                  onCardClick(item.id, item.start_sec);
                }}
                title={`${'\u8df3\u8f6c\u5230 '} ${formatSeconds(item.start_sec)}`}
              >
                <button
                  ref={index === 0 ? firstActionButtonRef : null}
                  type='button'
                  className='absolute right-2 top-2 z-10 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-white/90 px-2 text-zinc-700 shadow-sm hover:bg-white'
                  aria-label={'\u6807\u6ce8\u64cd\u4f5c\u83dc\u5355'}
                  title={'\u6807\u6ce8\u4fee\u8ba2'}
                  onMouseEnter={() => onActionHover(item.id)}
                  onMouseLeave={() => onActionHover(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onActionToggle(item.id);
                  }}
                >
                  {hoveredActionId === item.id ? (
                    <span className='text-[11px] font-medium'>{'\u6807\u6ce8\u4fee\u8ba2'}</span>
                  ) : (
                    moreIcon
                  )}
                </button>
                {openActionId === item.id ? (
                  <div
                    className='absolute right-2 top-11 z-20 w-28 rounded-md border border-zinc-200 bg-white p-1 shadow-lg'
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type='button'
                      className='block w-full rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100'
                      onClick={() => onEdit(item.id)}
                    >
                      {'\u7f16\u8f91'}
                    </button>
                    <button
                      type='button'
                      className='block w-full rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50'
                      onClick={() => onDelete(item.id)}
                    >
                      {'\u5220\u9664'}
                    </button>
                  </div>
                ) : null}
                {item.thumb_base64 ? (
                  <img
                    src={item.thumb_base64}
                    alt={'\u6807\u6ce8\u7f29\u7565\u56fe'}
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
                    {item.drivers.map((driver) => driverLabelMap[driver] ?? driver).join('\u3001')}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
