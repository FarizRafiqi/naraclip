import { type Data } from '@generated/data'
import { Form, Link } from '@inertiajs/react'
import { type ReactElement } from 'react'

export default function Layout({ children }: { children: ReactElement<Data.SharedProps> }) {
  const user = children.props.user

  return (
    <div className="min-h-screen bg-[#0b1020] text-slate-100">
      <header className="border-b border-white/10 bg-[#0b1020]/90 px-6 py-5 backdrop-blur sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Nara<span className="text-cyan-300">Clip</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-300">
            {user ? (
              <Form action={{ url: '/logout', method: 'post' }}>
                <button
                  type="submit"
                  className="rounded-lg border border-white/10 px-3 py-2 transition hover:border-cyan-300/50 hover:text-white"
                >
                  Logout
                </button>
              </Form>
            ) : (
              <>
                <Link href="/login" className="transition hover:text-white">
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-cyan-300 px-3 py-2 font-medium text-slate-950 transition hover:bg-cyan-200"
                >
                  Daftar
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
