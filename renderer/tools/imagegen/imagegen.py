"""NaraClip image generation runner (lane: web Gemini via cookies, + manual prompt pack).

Usage (from repo root):
  uv run --python 3.13 --with gemini_webapi python renderer/tools/imagegen/imagegen.py generate <slug> [--only id,id] [--limit N] [--delay 8-20]
  uv run --python 3.13 python renderer/tools/imagegen/imagegen.py pack <slug>        # prompts to paste into gemini.google.com by hand
  uv run --python 3.13 python renderer/tools/imagegen/imagegen.py check              # verify cookies/account only

Jobs live in renderer/content/<slug>/data/image-jobs.json (see schema in templates.json).
Output: raw images -> the content's inbox dir (default: D:\\Projects\\Shorts\\<NN_slug>\\02_images\\generated-raw),
manifest -> renderer/content/<slug>/data/imagegen-manifest.json. Existing outputs are skipped (cache).

Auth: cookies __Secure-1PSID / __Secure-1PSIDTS from a LOGGED-IN gemini.google.com session, stored in
~/.config/naraclip/gemini.env (chmod 600):
  GEMINI_PSID=...
  GEMINI_PSIDTS=...
This uses an unofficial client (HanaokaYuzu/gemini_webapi). It can break when Google changes the web app and may
violate Google's terms: use a separate account if possible, keep volume low (default cap 30 images/day), and never
strip the watermark.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import re
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TEMPLATES = json.loads((Path(__file__).parent / 'templates.json').read_text())
ENV_FILE = Path.home() / '.config/naraclip/gemini.env'
DAILY_CAP = int(os.environ.get('NARACLIP_IMAGE_DAILY_CAP', '30'))
STATE_FILE = Path.home() / '.config/naraclip/imagegen-usage.json'


def content_dir(slug: str) -> Path:
    d = ROOT / 'renderer/content' / slug
    if not d.is_dir():
        sys.exit(f'content not found: {d}')
    return d


def shorts_dir(slug: str) -> Path | None:
    base = Path('/mnt/d/Projects/Shorts')
    if not base.is_dir():
        return None
    for p in sorted(base.iterdir()):
        if p.is_dir() and re.fullmatch(rf'\d+_{re.escape(slug)}', p.name):
            return p
    return None


def load_jobs(slug: str) -> list[dict]:
    f = content_dir(slug) / 'data/image-jobs.json'
    if not f.exists():
        sys.exit(f'missing {f}')
    return json.loads(f.read_text())['jobs']


def has_output(outd: Path, job_id: str) -> bool:
    return any('.tmp.' not in p.name for p in outd.glob(job_id + '.*'))


def compose(job: dict) -> str:
    kind = job['kind']
    tpl = TEMPLATES[kind]
    bg = TEMPLATES['backgrounds'][job.get('bg', 'white')]
    if kind == 'bg':
        return tpl.format(text=job['text'])
    return tpl.format(text=job['text'].strip(), bg=bg)


def out_dir(slug: str, override: str | None) -> Path:
    if override:
        return Path(override)
    sd = shorts_dir(slug)
    if sd:
        return sd / '02_images/generated-raw'
    return content_dir(slug) / 'assets/visuals/generated/raw'


def resolve_ref(slug: str, ref: str) -> Path:
    """refs are file names relative to the cutout/raw dirs or absolute paths."""
    p = Path(ref)
    if p.is_absolute() and p.exists():
        return p
    sd = shorts_dir(slug)
    cands = []
    if sd:
        cands += [sd / '02_images/cutout' / ref, sd / '02_images/generated-raw' / ref]
    cands += [content_dir(slug) / 'assets/visuals/source/characters' / ref]
    for c in cands:
        if c.exists():
            return c
    sys.exit(f'reference not found: {ref}')


def read_env() -> dict[str, str]:
    env = dict(os.environ)
    if ENV_FILE.exists():
        mode = ENV_FILE.stat().st_mode & 0o077
        if mode:
            print(f'warning: {ENV_FILE} is readable by others; run chmod 600', file=sys.stderr)
        for line in ENV_FILE.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.split('=', 1)
                env.setdefault(k.strip(), v.strip().strip('"\''))
    return env


def usage_today() -> int:
    if STATE_FILE.exists():
        s = json.loads(STATE_FILE.read_text())
        if s.get('date') == str(date.today()):
            return s.get('count', 0)
    return 0


def bump_usage() -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps({'date': str(date.today()), 'count': usage_today() + 1}))


def finalize_extension(tmp: Path, job_id: str) -> str:
    """The web client does not tell us the encoding; name the file after its real magic bytes."""
    head = tmp.read_bytes()[:12]
    ext = '.png' if head.startswith(b'\x89PNG') else '.jpg' if head.startswith(b'\xff\xd8') else '.webp' if head[8:12] == b'WEBP' else '.png'
    final = tmp.with_name(job_id + ext)
    tmp.replace(final)
    return str(final)


async def make_client():
    from gemini_webapi import GeminiClient

    env = read_env()
    psid, psidts = env.get('GEMINI_PSID'), env.get('GEMINI_PSIDTS')
    if not psid:
        sys.exit(f'GEMINI_PSID missing. Put cookies in {ENV_FILE} (see header of imagegen.py).')
    client = GeminiClient(psid, psidts)
    await client.init(timeout=180, auto_refresh=True, verbose=False)
    return client


async def cmd_check(_args) -> None:
    client = await make_client()
    try:
        models = await client.list_models()
        print('ok. models:', [getattr(m, 'model_name', str(m)) for m in (models or [])][:8])
    finally:
        await client.close()


async def cmd_generate(args) -> None:
    from gemini_webapi.exceptions import (AuthError, ImageGenerationError, TemporarilyBlockedError,
                                          UsageLimitExceededError)

    slug = args.slug
    jobs = [j for j in load_jobs(slug) if j.get('lane', 'web') == 'web']
    if args.only:
        wanted = set(args.only.split(','))
        jobs = [j for j in jobs if j['id'] in wanted]
    outd = out_dir(slug, args.out)
    outd.mkdir(parents=True, exist_ok=True)
    manifest_f = content_dir(slug) / 'data/imagegen-manifest.json'
    manifest = json.loads(manifest_f.read_text()) if manifest_f.exists() else {}
    todo = [j for j in jobs if not has_output(outd, j['id'])]
    if args.limit:
        todo = todo[: args.limit]
    print(f'{len(jobs)} web jobs, {len(jobs) - len(todo)} cached/skipped, {len(todo)} to generate -> {outd}')
    if args.dry_run or not todo:
        for j in todo:
            print(f'--- {j["id"]} refs={j.get("refs", [])}\n{compose(j)}\n')
        return

    lo, hi = (float(x) for x in args.delay.split('-'))
    client = await make_client()
    done = 0
    try:
        for j in todo:
            if usage_today() >= DAILY_CAP:
                print(f'daily cap {DAILY_CAP} reached; stop (set NARACLIP_IMAGE_DAILY_CAP to change)')
                break
            files = [str(resolve_ref(slug, r)) for r in j.get('refs', [])] or None
            t0 = time.time()
            for attempt in (1, 2):
                try:
                    resp = await client.generate_content(compose(j), files=files)
                    imgs = resp.images
                    if not imgs:
                        raise ImageGenerationError('no image in response: ' + (resp.text or '')[:120])
                    tmp = await imgs[0].save(path=str(outd), filename=j['id'] + '.tmp.png', full_size=True)
                    path = finalize_extension(Path(tmp), j['id'])
                    bump_usage()
                    manifest[j['id']] = {'backend': 'gemini_webapi', 'file': Path(path).name,
                                         'seconds': round(time.time() - t0, 1), 'refs': j.get('refs', []),
                                         'date': str(date.today())}
                    manifest_f.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
                    print(f'ok  {j["id"]}  {time.time() - t0:.0f}s  -> {path}')
                    done += 1
                    break
                except (AuthError, UsageLimitExceededError, TemporarilyBlockedError) as e:
                    print(f'STOP {j["id"]}: {type(e).__name__}: {e}  (fall back to `pack` or another backend)')
                    return
                except Exception as e:  # noqa: BLE001 - retry once on transient/model refusals
                    print(f'fail {j["id"]} attempt {attempt}: {type(e).__name__}: {str(e)[:160]}')
                    if attempt == 2:
                        manifest.setdefault('_failed', {})[j['id']] = str(e)[:200]
                    await asyncio.sleep(random.uniform(lo, hi))
            await asyncio.sleep(random.uniform(lo, hi))
    finally:
        await client.close()
        manifest_f.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f'done {done}/{len(todo)}')


def cmd_pack(args) -> None:
    slug = args.slug
    jobs = load_jobs(slug)
    outd = out_dir(slug, args.out)
    lines = [f'# Prompt pack: {slug}', '',
             f'Simpan hasil ke `{outd}` dengan nama file di kolom "Simpan sebagai" (JPG/PNG).',
             'Generate job yang punya referensi SETELAH referensinya jadi; lampirkan file referensi di chat Gemini.', '']
    for i, j in enumerate(jobs, 1):
        have = has_output(outd, j['id'])
        lines += [f'## {i}. {j["id"]} {"(sudah ada)" if have else ""}'.rstrip(),
                  f'- Simpan sebagai: `{j["id"]}.png`',
                  f'- Lampirkan: {", ".join(j.get("refs", [])) or "-"}',
                  '', '```text', compose(j), '```', '']
    f = content_dir(slug) / 'data/prompt-pack.md'
    f.write_text('\n'.join(lines))
    print('wrote', f)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    g = sub.add_parser('generate')
    g.add_argument('slug')
    g.add_argument('--only')
    g.add_argument('--limit', type=int)
    g.add_argument('--delay', default='8-20')
    g.add_argument('--out')
    g.add_argument('--dry-run', action='store_true')
    p = sub.add_parser('pack')
    p.add_argument('slug')
    p.add_argument('--out')
    sub.add_parser('check')
    args = ap.parse_args()
    if args.cmd == 'generate':
        asyncio.run(cmd_generate(args))
    elif args.cmd == 'pack':
        cmd_pack(args)
    else:
        asyncio.run(cmd_check(args))


if __name__ == '__main__':
    main()
