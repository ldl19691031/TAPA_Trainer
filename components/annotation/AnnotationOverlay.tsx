import type { FormEvent, ReactNode, RefObject } from 'react';
import { CUE_ROWS, DRIVE_OPTIONS } from '../../lib/drives';
import type { NormalizedBox, PersonCandidate } from '../../lib/person-utils';

type VideoOverlayLayout = {
  viewportLeft: number;
  viewportTop: number;
  width: number;
  height: number;
};

type AnnotationOverlayProps = {
  isOpen: boolean;
  isPlayerFullscreen: boolean;
  videoOverlayLayout: VideoOverlayLayout | null;
  isPersonPicking: boolean;
  personCandidates: PersonCandidate[];
  selectedPersonTrackId: number | null;
  selectedPersonBox: NormalizedBox | null;
  selectedDrivers: string[];
  isLoadingPersonCandidates: boolean;
  quickMode: boolean;
  comment: string;
  maxCommentLength: number;
  saving: boolean;
  selectedVideoId: string;
  editingAnnotationId: string | null;
  queryError: string;
  firstDriverButtonRef: RefObject<HTMLButtonElement | null>;
  personPickButtonRef: RefObject<HTMLButtonElement | null>;
  saveAnnotationButtonRef: RefObject<HTMLButtonElement | null>;
  closeIcon: ReactNode;
  userTagIcon: ReactNode;
  onClose: () => void;
  onDismissPersonPicking: () => void;
  onSelectPersonCandidate: (candidate: PersonCandidate) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleDriver: (driverId: string) => void;
  onReloadCandidates: () => void;
  onCommentChange: (value: string) => void;
  onStartPersonPicking: () => void;
  onCancelEdit: () => void;
};

export function AnnotationOverlay({
  isOpen,
  isPlayerFullscreen,
  videoOverlayLayout,
  isPersonPicking,
  personCandidates,
  selectedPersonTrackId,
  selectedPersonBox,
  selectedDrivers,
  isLoadingPersonCandidates,
  quickMode,
  comment,
  maxCommentLength,
  saving,
  selectedVideoId,
  editingAnnotationId,
  queryError,
  firstDriverButtonRef,
  personPickButtonRef,
  saveAnnotationButtonRef,
  closeIcon,
  userTagIcon,
  onClose,
  onDismissPersonPicking,
  onSelectPersonCandidate,
  onSubmit,
  onToggleDriver,
  onReloadCandidates,
  onCommentChange,
  onStartPersonPicking,
  onCancelEdit,
}: AnnotationOverlayProps) {
  if (!isOpen) {
    return null;
  }

  return (
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
              aria-label={'\u9000\u51fa\u9009\u4eba\u6a21\u5f0f'}
              onClick={onDismissPersonPicking}
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
                  left: videoOverlayLayout.viewportLeft + candidate.box.left * videoOverlayLayout.width,
                  top: videoOverlayLayout.viewportTop + candidate.box.top * videoOverlayLayout.height,
                  width: candidate.box.width * videoOverlayLayout.width,
                  height: candidate.box.height * videoOverlayLayout.height,
                }}
                onClick={() => onSelectPersonCandidate(candidate)}
                aria-label={`\u5728\u89c6\u9891\u4e2d\u9009\u62e9\u8f68\u8ff9 ${candidate.trackId}`}
                title={`\u9009\u62e9\u8f68\u8ff9 #${candidate.trackId}`}
              >
                <span
                  className={`absolute left-1 top-1 rounded px-1 text-[10px] font-semibold ${
                    selected ? 'bg-blue-600 text-white' : 'bg-black/70 text-white'
                  }`}
                >
                  {selected ? `\u5df2\u9009 #${candidate.trackId}` : `#${candidate.trackId}`}
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
            <h2 className='text-base font-semibold text-zinc-900'>{'\u6807\u6ce8'}</h2>
            <button
              className='inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
              onClick={onClose}
              type='button'
              aria-label={'\u5173\u95ed'}
              title={'\u5173\u95ed'}
            >
              {closeIcon}
            </button>
          </div>

          <form className='space-y-3' onSubmit={onSubmit}>
            <div className='flex flex-wrap gap-2'>
              {DRIVE_OPTIONS.map((driver, index) => {
                const active = selectedDrivers.includes(driver.id);
                return (
                  <button
                    ref={index === 0 ? firstDriverButtonRef : null}
                    key={driver.id}
                    type='button'
                    onClick={() => onToggleDriver(driver.id)}
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
                onClick={onReloadCandidates}
              >
                {isLoadingPersonCandidates ? '\u8bfb\u53d6\u4e2d...' : '\u5237\u65b0\u5019\u9009'}
              </button>
            </div>

            {!quickMode ? (
              <label className='text-sm text-zinc-700'>
                {'\u8bc4\u8bba'}
                <textarea
                  className='mt-1 h-24 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm'
                  maxLength={maxCommentLength}
                  value={comment}
                  onChange={(event) => onCommentChange(event.target.value)}
                />
              </label>
            ) : null}

            <div className='flex items-center gap-2'>
              <button
                ref={personPickButtonRef}
                type='button'
                className={`inline-flex h-10 w-10 items-center justify-center rounded-md border text-zinc-700 ${
                  isPersonPicking ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-zinc-300 hover:bg-zinc-50'
                }`}
                title={'\u9009\u62e9\u6807\u6ce8\u5bf9\u8c61'}
                aria-label={'\u9009\u62e9\u6807\u6ce8\u5bf9\u8c61'}
                onClick={onStartPersonPicking}
              >
                {userTagIcon}
              </button>
              <button
                ref={saveAnnotationButtonRef}
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
                onClick={onCancelEdit}
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
  );
}
