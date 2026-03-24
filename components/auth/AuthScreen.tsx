import type { FormEvent } from 'react';

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
  if (loading) {
    return <main className='mx-auto flex min-h-screen items-center justify-center'>{'加载中...'}</main>;
  }

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10'>
      <section className='w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm'>
        <h1 className='text-xl font-semibold text-zinc-900'>{'驱力训练'}</h1>
        <p className='mt-2 text-sm text-zinc-600'>{'使用 Magic Link 登录，登录后会保持会话。'}</p>
        {!envReady ? (
          <p className='mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-800'>
            {'缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。'}
          </p>
        ) : null}
        <form className='mt-4 space-y-3' onSubmit={onSubmit}>
          <input
            className='w-full rounded-md border border-zinc-300 px-3 py-2 text-sm'
            placeholder='your@email.com'
            type='email'
            required
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
          <button
            className='w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60'
            type='submit'
            disabled={authSending || magicCooldown > 0}
          >
            {authSending
              ? '发送中...'
              : magicCooldown > 0
                ? `${magicCooldown}s 后重试`
                : '发送 Magic Link'}
          </button>
        </form>
        {authMessage ? <p className='mt-3 text-sm text-zinc-700'>{authMessage}</p> : null}
      </section>
    </main>
  );
}
