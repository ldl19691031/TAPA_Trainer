import Image from 'next/image';
import { useEffect, useState, type FormEvent } from 'react';
import { Manrope, Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-playfair',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-manrope',
});

const quoteLines = [
  '驱力是指一瞬间或持续不超过 7 秒的行为。',
  '人们对此没有任何直接感觉，只有先识别驱力行为，才能进一步感受阻碍器和扭曲。',
  '脚本可能在一生、每年、每天，也可能在几秒钟内以微缩的版本重复上演。',
  '驱力行为的暂停，也会阻止同时出现的脚本语句模式。',
] as const;

const sourceNote = '出自 Taibi Kahler, Ph.D.《驱力：脚本过程中的重要因素》（1975）';
const background = '/auth-concepts/light-a3-ink.png';

type AuthScreenProps = {
  loading: boolean;
  envReady: boolean;
  email: string;
  authSending: boolean;
  magicCooldown: number;
  authMessage: string;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function PacAlignedMark() {
  return (
    <div className='flex flex-col items-start'>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className='h-[64px] w-[64px] rounded-full border border-[#36414a]/66 shadow-[0_0_18px_rgba(103,116,126,0.1)]'
          style={{ marginTop: index === 0 ? 0 : -1 }}
        />
      ))}
    </div>
  );
}

function HeroHeading() {
  return (
    <div className='flex flex-col gap-2 py-[2px] text-[#15191f]'>
      <p className='text-[11px] uppercase tracking-[0.42em] text-[#59606b]'>Transactional Analysis</p>
      <h1 className={`${playfair.className} text-5xl leading-[0.94] font-medium md:text-6xl`}>Drive Trainer</h1>
      <p className='text-sm tracking-[0.2em] text-[#59606b]'>驱力识别练习</p>
    </div>
  );
}

function QuotePlaybackPanel({ line }: { line: string }) {
  return (
    <div className='flex min-h-[300px] flex-col rounded-[24px] border border-[#25303b]/10 bg-[rgba(249,247,241,0.78)] p-4 shadow-[0_24px_70px_rgba(94,104,118,0.08)] backdrop-blur-md'>
      <div className='relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-black/8 bg-white/38 p-4'>
        <div className='flex h-full items-center px-6'>
          <p key={line} className='ta-auth-quote max-w-[700px] text-base leading-8 text-[#15191f]'>
            {line}
          </p>
        </div>
      </div>
      <p className='mt-3 text-[11px] leading-5 text-[#59606b]'>{sourceNote}</p>
    </div>
  );
}

export function AuthScreen({
  loading,
  envReady,
  email,
  authSending,
  magicCooldown,
  authMessage,
  onEmailChange,
  onSubmit,
}: AuthScreenProps) {
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % quoteLines.length);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, []);

  if (loading) {
    return <main className='mx-auto flex min-h-screen items-center justify-center'>加载中...</main>;
  }

  return (
    <main className={`relative min-h-screen overflow-hidden bg-[#f7f4ec] text-[#15191f] ${manrope.className}`}>
      <div className='absolute inset-0'>
        <style jsx global>{`
          @keyframes auth-quote-fade {
            0% {
              opacity: 0;
              transform: translateY(8px);
            }
            12% {
              opacity: 1;
              transform: translateY(0);
            }
            82% {
              opacity: 1;
              transform: translateY(0);
            }
            100% {
              opacity: 0;
              transform: translateY(-8px);
            }
          }
          .ta-auth-quote {
            animation: auth-quote-fade 4s ease-in-out;
          }
        `}</style>
        <Image
          src={background}
          alt='Drive Trainer login background'
          fill
          priority
          className='object-cover'
          sizes='100vw'
        />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.26),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.12),rgba(246,243,235,0.72))]' />
      </div>

      <div className='relative mx-auto flex min-h-screen w-full max-w-[1480px] items-center px-5 py-8 md:px-8 md:py-10'>
        <section className='w-full -translate-y-6 rounded-[32px] border border-[#25303b]/10 p-8 shadow-[0_30px_96px_rgba(125,135,148,0.1)] md:-translate-y-8 md:p-12'>
          <div className='space-y-6'>
            <div className='grid gap-6 md:grid-cols-[64px_1fr] md:items-start'>
              <PacAlignedMark />
              <HeroHeading />
            </div>

            <div className='relative min-h-[360px]'>
              <div className='max-w-[860px] pr-0 md:pr-10'>
                <QuotePlaybackPanel line={quoteLines[quoteIndex]} />
              </div>
              <div className='mt-4 lg:absolute lg:right-0 lg:top-8 lg:mt-0 lg:w-[38%]'>
                <section className='flex min-h-[280px] w-full flex-col rounded-[30px] border border-[#25303b]/10 bg-[rgba(249,247,241,0.82)] p-7 shadow-[0_24px_70px_rgba(94,104,118,0.12)] backdrop-blur-xl'>
                  {!envReady ? (
                    <p className='mb-4 rounded-2xl border border-[#b8860b]/20 bg-[#fff7dd]/84 px-3 py-2 text-sm leading-6 text-[#7d5b13]'>
                      缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。
                    </p>
                  ) : null}

                  <form className='space-y-4' onSubmit={onSubmit}>
                    <div className='rounded-2xl border border-[#25303b]/10 bg-white/76 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]'>
                      <input
                        className='w-full bg-transparent text-sm text-[#15191f] outline-none placeholder:text-[#59606b]'
                        placeholder='godofpen05@gmail.com'
                        type='email'
                        required
                        value={email}
                        onChange={(event) => onEmailChange(event.target.value)}
                      />
                    </div>
                    <button
                      className='inline-flex items-center justify-center rounded-full border border-[#0f1720] bg-[#0f1720] px-6 py-3 text-sm font-medium text-[#f5f4ef] shadow-[0_10px_28px_rgba(17,24,39,0.14)] transition hover:bg-[#1d2833] disabled:cursor-not-allowed disabled:opacity-60'
                      type='submit'
                      disabled={authSending || magicCooldown > 0 || !envReady}
                    >
                      {authSending ? '发送中...' : magicCooldown > 0 ? `${magicCooldown}s 后重试` : '发送 Magic Link'}
                    </button>
                  </form>

                  <div className='mt-auto pt-5'>
                    <p className='text-xs leading-6 text-[#59606b]'>
                      点击后会向邮箱发送一封登录邮件，请点击邮件中的链接进入。
                    </p>
                    {authMessage ? <p className='mt-2 text-sm leading-6 text-[#374151]'>{authMessage}</p> : null}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
