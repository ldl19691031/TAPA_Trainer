import type { OnboardingStep } from '../../lib/onboarding';

type RectLike = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type PositionLike = {
  top: number;
  left: number;
};

type OnboardingOverlayProps = {
  isOpen: boolean;
  highlightRect: RectLike | null;
  cardPosition: PositionLike | null;
  currentStep: OnboardingStep;
  stepIndex: number;
  totalSteps: number;
  onClose: () => void;
  onSkip: () => void;
  onPrev: () => void;
  onNext: () => void;
  closeIcon: React.ReactNode;
};

export function OnboardingOverlay({
  isOpen,
  highlightRect,
  cardPosition,
  currentStep,
  stepIndex,
  totalSteps,
  onClose,
  onSkip,
  onPrev,
  onNext,
  closeIcon,
}: OnboardingOverlayProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className='pointer-events-none fixed inset-0 z-[120] p-4' role='dialog' aria-modal='true'>
      {highlightRect ? (
        <div
          className='pointer-events-none fixed rounded-xl border-2 border-blue-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]'
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
        />
      ) : (
        <div className='pointer-events-none fixed inset-0 bg-black/55' />
      )}
      <section
        className='pointer-events-auto fixed z-[130] w-[min(440px,calc(100vw-32px))] rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl'
        style={cardPosition ? { top: cardPosition.top, left: cardPosition.left } : undefined}
      >
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-base font-semibold text-zinc-900'>{'\u9996\u6b21\u4f7f\u7528\u5f15\u5bfc'}</h2>
          <button
            type='button'
            onClick={onClose}
            className='inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
            title={'\u5173\u95ed\u5f15\u5bfc'}
            aria-label={'\u5173\u95ed\u5f15\u5bfc'}
          >
            {closeIcon}
          </button>
        </div>

        <p className='mb-2 text-xs text-zinc-500'>
          {'\u7b2c'} {stepIndex + 1} / {totalSteps} {'\u6b65'}
        </p>
        <h3 className='text-lg font-semibold text-zinc-900'>{currentStep.title}</h3>
        <p className='mt-2 text-sm leading-6 text-zinc-700'>{currentStep.description}</p>
        {currentStep.actionHint ? (
          <p className='mt-2 rounded-md bg-blue-50 px-2 py-1.5 text-xs text-blue-700'>
            {currentStep.actionHint}
          </p>
        ) : null}

        <div className='mt-5 flex items-center justify-between'>
          <button
            type='button'
            onClick={onSkip}
            className='text-sm text-zinc-500 hover:text-zinc-700'
          >
            {'\u8df3\u8fc7\u5f15\u5bfc'}
          </button>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={onPrev}
              disabled={stepIndex === 0}
              className='rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-40'
            >
              {'\u4e0a\u4e00\u6b65'}
            </button>
            <button
              type='button'
              onClick={onNext}
              className='rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700'
            >
              {stepIndex === totalSteps - 1 ? '\u5b8c\u6210' : '\u4e0b\u4e00\u6b65'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
