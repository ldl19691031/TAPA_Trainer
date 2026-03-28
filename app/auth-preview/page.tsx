"use client";



import Image from 'next/image';

import { useState } from 'react';

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

  '\u9a71\u529b\u662f\u6307\u4e00\u77ac\u95f4\u6216\u6301\u7eed\u4e0d\u8d85\u8fc7 7 \u79d2\u7684\u884c\u4e3a\u3002',

  '\u4eba\u4eec\u5bf9\u6b64\u6ca1\u6709\u4efb\u4f55\u76f4\u63a5\u611f\u89c9\uff0c\u53ea\u6709\u5148\u8bc6\u522b\u9a71\u529b\u884c\u4e3a\uff0c\u624d\u80fd\u8fdb\u4e00\u6b65\u611f\u53d7\u963b\u788d\u5668\u548c\u626d\u66f2\u3002',

  '\u811a\u672c\u53ef\u80fd\u5728\u4e00\u751f\u3001\u6bcf\u5e74\u3001\u6bcf\u5929\uff0c\u4e5f\u53ef\u80fd\u5728\u51e0\u79d2\u949f\u5185\u4ee5\u5fae\u7f29\u7684\u7248\u672c\u91cd\u590d\u4e0a\u6f14\u3002',

  '\u9a71\u529b\u884c\u4e3a\u7684\u6682\u505c\uff0c\u4e5f\u4f1a\u963b\u6b62\u540c\u65f6\u51fa\u73b0\u7684\u811a\u672c\u8bed\u53e5\u6a21\u5f0f\u3002',

] as const;



const sourceNote = '\u51fa\u81ea Taibi Kahler, Ph.D.\u300a\u9a71\u529b\uff1a\u811a\u672c\u8fc7\u7a0b\u4e2d\u7684\u91cd\u8981\u56e0\u7d20\u300b\uff081975\uff09';

const background = '/auth-concepts/light-a3-ink.png';



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

    <div className='flex h-[212px] flex-col gap-2 py-[2px] text-[#15191f]'>

      <p className='text-[11px] uppercase tracking-[0.42em] text-[#59606b]'>Transactional Analysis</p>

      <h1 className={`${playfair.className} text-5xl leading-[0.94] font-medium md:text-6xl`}>Drive Trainer</h1>

      <p className='text-sm tracking-[0.2em] text-[#59606b]'>{'\u9a71\u529b\u8bc6\u522b\u7ec3\u4e60'}</p>

    </div>

  );

}



function MockInput({ placeholder }: { placeholder: string }) {

  return (

    <div className='rounded-2xl border border-[#25303b]/10 bg-white/76 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]'>

      <span className='text-sm text-[#59606b]'>{placeholder}</span>

    </div>

  );

}



function SubmitButton({ onClick }: { onClick: () => void }) {

  return (

    <button

      type='button'

      onClick={onClick}

      className='inline-flex items-center justify-center rounded-full border border-[#0f1720] bg-[#0f1720] px-6 py-3 text-sm font-medium text-[#f5f4ef] shadow-[0_10px_28px_rgba(17,24,39,0.14)] transition hover:bg-[#1d2833]'

    >

      {'\u53d1\u9001 Magic Link'}

    </button>

  );

}



function DeliveryNotes({ sent }: { sent: boolean }) {

  return (

    <div className='space-y-2'>

      <p className='text-xs leading-6 text-[#59606b]'>

        {'\u70b9\u51fb\u540e\u4f1a\u5411\u90ae\u7bb1\u53d1\u9001\u4e00\u5c01\u767b\u5f55\u90ae\u4ef6\uff0c\u8bf7\u70b9\u51fb\u90ae\u4ef6\u4e2d\u7684\u94fe\u63a5\u8fdb\u5165\u3002'}

      </p>

      {sent ? (

        <div className='rounded-2xl border border-[#b8860b]/20 bg-[#fff7dd]/84 px-3 py-2 text-xs leading-6 text-[#7d5b13]'>

          {'\u5982\u679c\u7b49\u5f85\u4e00\u6bb5\u65f6\u95f4\u540e\u4ecd\u672a\u6536\u5230\uff0c\u8bf7\u67e5\u770b\u5783\u573e\u7bb1\u3002'}

        </div>

      ) : null}

    </div>

  );

}



function LoginCard({ sent, onSend, className = '' }: { sent: boolean; onSend: () => void; className?: string }) {

  return (

    <div className={`flex min-h-[300px] w-full flex-col rounded-[30px] border border-[#25303b]/10 bg-[rgba(249,247,241,0.78)] p-7 shadow-[0_24px_70px_rgba(94,104,118,0.12)] backdrop-blur-xl ${className}`}>

      <div className='space-y-4'>

        <MockInput placeholder='godofpen05@gmail.com' />

        <SubmitButton onClick={onSend} />

      </div>

      <div className='mt-auto pt-5'>

        <DeliveryNotes sent={sent} />

      </div>

    </div>

  );

}



function QuotePlaybackPanel({ className = '' }: { className?: string }) {

  return (

    <div className={`flex min-h-[300px] flex-col rounded-[24px] border border-[#25303b]/10 bg-[rgba(249,247,241,0.78)] p-4 shadow-[0_24px_70px_rgba(94,104,118,0.08)] backdrop-blur-md ${className}`}>

      <div className='relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-black/8 bg-white/38 p-4'>

        {quoteLines.map((line, index) => (

          <div

            key={line}

            className='ta-auth-fade absolute inset-0 flex items-center px-6'

            style={{ animationDelay: `${index * 4}s` }}

          >

            <p className='max-w-[700px] text-base leading-8 text-[#15191f]'>{line}</p>

          </div>

        ))}

      </div>

      <p className='mt-3 text-[11px] leading-5 text-[#59606b]'>{sourceNote}</p>

    </div>

  );

}



function HeroBlock() {

  return (

    <div className='grid gap-6 md:grid-cols-[64px_1fr] md:items-start'>

      <PacAlignedMark />

      <HeroHeading />

    </div>

  );

}



function LayoutTwo({ sent, onSend }: { sent: boolean; onSend: () => void }) {
  return (
    <div className='space-y-6'>
      <HeroBlock />

      <div className='relative min-h-[360px]'>

        <div className='max-w-[860px] pr-10'>

          <QuotePlaybackPanel className='min-h-[316px] rounded-[28px]' />

        </div>

        <div className='mt-4 lg:absolute lg:right-0 lg:top-8 lg:mt-0 lg:w-[38%]'>

          <LoginCard sent={sent} onSend={onSend} className='min-h-[280px] rounded-[28px]' />

        </div>

      </div>

    </div>

  );
}


export default function AuthPreviewPage() {

  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});



  return (

    <main className={`min-h-screen bg-[#f7f4ec] text-[#15191f] ${manrope.className}`}>

      <style jsx global>{`

        @keyframes auth-fade-cycle {

          0%, 19% { opacity: 0; transform: translateY(10px); }

          24%, 44% { opacity: 1; transform: translateY(0); }

          49%, 100% { opacity: 0; transform: translateY(-10px); }

        }

        .ta-auth-fade {

          animation: auth-fade-cycle 16s ease-in-out infinite;

        }

      `}</style>

      <div className='mx-auto max-w-[1480px] px-5 py-8 md:px-8 md:py-10'>

        <header className='mb-8 flex flex-col gap-4 border-b border-black/8 pb-6 md:flex-row md:items-end md:justify-between'>

          <div>

            <p className='text-xs uppercase tracking-[0.45em] text-[#666c76]'>Auth Exploration</p>

            <h1 className={`${playfair.className} mt-3 text-5xl font-medium text-[#131720] md:text-6xl`}>

              {'\u4e0b\u65b9\u5361\u7247\u6392\u7248\u9884\u89c8'}

            </h1>

          </div>

          <p className='max-w-3xl text-sm leading-7 text-[#5b636d]'>

            {'\u4fdd\u7559\u4f60\u9009\u4e2d\u7684\u4e0b\u65b9\u6392\u7248 2\uff0c\u8fd9\u6b21\u53ea\u4fee\u6b63 PAC \u4e09\u5706\u7684\u51e0\u4f55\u5173\u7cfb\uff1a\u4e09\u4e2a\u5706\u73b0\u5728\u4e25\u683c\u4e0a\u4e0b\u6392\u5217\u3001\u76f8\u4e92\u63a5\u89e6\uff0c\u5e76\u5728\u8fb9\u7f18\u76f8\u5207\u3002'}
          </p>
        </header>

        <section className='space-y-3'>
          <div className='flex flex-col gap-2 md:flex-row md:items-end md:justify-between'>
            <h2 className='text-sm font-medium tracking-[0.22em] text-[#15191f]'>
              {'\u4e0b\u65b9\u6392\u7248 2 / Staggered Stack'}
            </h2>
            <p className='text-sm leading-7 text-[#5b636d]'>
              {'\u8bba\u6587\u5361\u7247\u4f5c\u4e3a\u5e95\uff0c\u767b\u5f55\u5361\u7247\u50cf\u6863\u6848\u88ab\u53e0\u5728\u53f3\u4e0a\u89d2\u3002'}
            </p>
          </div>

          <div className='relative overflow-hidden rounded-[34px] bg-[#f7f4ec]'>
            <Image
              src={background}
              alt={'\u4e0b\u65b9\u6392\u7248 2 / Staggered Stack'}
              width={1536}
              height={1024}
              className='absolute inset-0 h-full w-full object-cover'
              priority
            />
            <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.26),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.12),rgba(246,243,235,0.72))]' />

            <div className='relative rounded-[32px] border border-[#25303b]/10 p-8 shadow-[0_30px_96px_rgba(125,135,148,0.1)] md:p-12'>
              <LayoutTwo
                sent={Boolean(sentMap.staggered_stack)}
                onSend={() => setSentMap((current) => ({ ...current, staggered_stack: true }))}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
