import { motion } from 'framer-motion'

export default function Home() {
  return (
    <section className="min-h-screen bg-[#0b1020] px-6 py-16 text-slate-100 sm:px-10">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mx-auto flex max-w-5xl flex-col gap-8"
      >
        <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-300">
          NaraClip MVP
        </p>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-7xl">
          Turn one idea into a short, visual story.
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">
          Create explainers from a structured SceneSpec, generate visual assets, and render a
          vertical story with HyperFrames.
        </p>
        <div className="flex flex-wrap gap-3">
          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100">
            AdonisJS + Inertia React
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            Tailwind + Framer Motion
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            HyperFrames renderer
          </span>
        </div>
      </motion.section>
    </section>
  )
}
