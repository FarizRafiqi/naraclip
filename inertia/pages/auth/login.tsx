import { Form, Link } from '@inertiajs/react'
import { motion } from 'framer-motion'

type LoginForm = {
  email: string
  password: string
}

type LoginFormSlot = {
  errors: Partial<Record<keyof LoginForm, string | string[]>>
  processing?: boolean
}

export default function Login() {
  return (
    <div className="relative flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-12">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -top-20 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Masuk ke <span className="text-cyan-400">NaraClip</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Masukkan email dan password untuk mengakses dashboard
            </p>
          </div>

          <Form<LoginForm> action={{ url: '/login', method: 'post' }}>
            {({ errors, processing }: LoginFormSlot) => (
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Email
                  </label>
                  <div className="mt-1.5">
                    <input
                      type="email"
                      name="email"
                      id="email"
                      autoComplete="username"
                      required
                      placeholder="nama@email.com"
                      data-invalid={errors.email ? 'true' : undefined}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 shadow-inner outline-none transition focus:border-cyan-400 focus:bg-slate-950 focus:ring-2 focus:ring-cyan-400/20 data-[invalid=true]:border-rose-500 data-[invalid=true]:focus:ring-rose-500/20"
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1.5 text-xs text-rose-400">
                      {Array.isArray(errors.email) ? errors.email[0] : errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                    >
                      Password
                    </label>
                  </div>
                  <div className="mt-1.5">
                    <input
                      type="password"
                      name="password"
                      id="password"
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      data-invalid={errors.password ? 'true' : undefined}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 shadow-inner outline-none transition focus:border-cyan-400 focus:bg-slate-950 focus:ring-2 focus:ring-cyan-400/20 data-[invalid=true]:border-rose-500 data-[invalid=true]:focus:ring-rose-500/20"
                    />
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 text-xs text-rose-400">
                      {Array.isArray(errors.password) ? errors.password[0] : errors.password}
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={processing}
                    className="w-full rounded-xl bg-cyan-400 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-300 hover:shadow-cyan-400/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ color: '#020617' }}
                  >
                    {processing ? 'Memproses...' : 'Masuk Sekarang'}
                  </button>
                </div>

                <div className="text-center pt-2">
                  <p className="text-sm text-slate-400">
                    Belum punya akun?{' '}
                    <Link
                      href="/signup"
                      className="font-medium text-cyan-400 transition hover:text-cyan-300 hover:underline"
                    >
                      Daftar gratis
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </Form>
        </div>
      </motion.div>
    </div>
  )
}
