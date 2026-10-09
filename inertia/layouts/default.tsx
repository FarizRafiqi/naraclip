import { type Data } from '@generated/data'
import { Form, Link } from '@inertiajs/react'
import { type ReactElement } from 'react'

export default function Layout({ children }: { children: ReactElement<Data.SharedProps> }) {
  const user = children.props.user

  return (
    <div className="min-h-screen bg-[#0b1020] text-slate-100 flex flex-col">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b1020]/80 px-6 py-4 backdrop-blur-md sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-white transition hover:opacity-90"
          >
            <span>Nara</span>
            <span className="text-cyan-400">Clip</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            {user ? (
              <Form action={{ url: '/logout', method: 'post' }}>
                <button
                  type="submit"
                  className="rounded-lg border border-white/10 px-4 py-2 text-slate-300 transition hover:border-cyan-400/50 hover:text-white"
                >
                  Logout
                </button>
              </Form>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 py-2 text-slate-300 transition hover:text-white"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 shadow-md shadow-cyan-400/20 transition hover:bg-cyan-300 hover:shadow-cyan-400/30 active:scale-95"
                  style={{ color: '#020617' }}
                >
                  Daftar
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
