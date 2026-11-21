mod motion;
mod svg_scene;
mod types;

use std::collections::{HashMap, VecDeque};
use std::env;
use std::fs;
use std::io::Write;
use std::ops::Deref;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Instant;

use rayon::prelude::*;

use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg;

use crate::svg_scene::{
    composite_caption_onto_bgr24, load_font_database, SceneRenderer, CAP_H, CAP_STRIP_BYTES,
    HEIGHT, STAGE_SLICE1_END, STAGE_SLICE2_END, WIDTH,
};
use crate::types::RemotionProps;

#[derive(Clone)]
struct BufferPool {
    buf_len: usize,
    free: Arc<Mutex<Vec<Vec<u8>>>>,
}

impl BufferPool {
    fn new(buf_len: usize) -> Self {
        Self {
            buf_len,
            free: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn take(&self) -> PooledBuf {
        let vec = self
            .free
            .lock()
            .unwrap()
            .pop()
            .unwrap_or_else(|| vec![0u8; self.buf_len]);
        PooledBuf {
            data: Some(vec),
            pool: self.clone(),
        }
    }
}

struct PooledBuf {
    data: Option<Vec<u8>>,
    pool: BufferPool,
}

impl PooledBuf {
    fn as_mut_slice(&mut self) -> &mut [u8] {
        self.data.as_deref_mut().unwrap()
    }
}

impl Deref for PooledBuf {
    type Target = [u8];
    fn deref(&self) -> &[u8] {
        self.data.as_deref().unwrap()
    }
}

impl Drop for PooledBuf {
    fn drop(&mut self) {
        if let Some(v) = self.data.take() {
            if let Ok(mut g) = self.pool.free.lock() {
                if g.len() < 96 {
                    g.push(v);
                }
            }
        }
    }
}

fn print_usage() {
    eprintln!(
        "Usage: naraclip-fast-render --props <props.json> --public-dir <dir> --output <final.mp4> [--fps 30] [--ffmpeg <path>] [--no-nvenc] [--still <frame>] | --svg <in.svg> --output <out.png> [--width 1280 --height 720 --public-dir <dir>]"
    );
}

fn find_remotion_ffmpeg() -> String {
    if let Ok(p) = env::var("NARACLIP_FFMPEG") {
        if std::path::Path::new(&p).exists() {
            return p;
        }
    }
    if let Ok(exe) = env::current_exe() {
        // Walk up looking for node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg
        for anc in exe.ancestors() {
            let p1 = anc.join("node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg");
            if p1.exists() {
                return p1.to_string_lossy().to_string();
            }
            let p2 = anc.join("packages/remotion/node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg");
            if p2.exists() {
                return p2.to_string_lossy().to_string();
            }
        }
    }
    "ffmpeg".to_string()
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let mut props_path: Option<PathBuf> = None;
    let mut svg_path: Option<PathBuf> = None;
    let mut public_dir: Option<PathBuf> = None;
    let mut output_path: Option<PathBuf> = None;
    let mut ffmpeg_bin: Option<String> = None;
    let mut fps: f64 = 30.0;
    let mut width_arg: u32 = WIDTH;
    let mut height_arg: u32 = HEIGHT;
    let mut no_nvenc = false;
    let mut still_frame: Option<u32> = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--props" if i + 1 < args.len() => { props_path = Some(PathBuf::from(&args[i + 1])); i += 2; }
            "--svg" if i + 1 < args.len() => { svg_path = Some(PathBuf::from(&args[i + 1])); i += 2; }
            "--public-dir" if i + 1 < args.len() => { public_dir = Some(PathBuf::from(&args[i + 1])); i += 2; }
            "--output" | "-o" if i + 1 < args.len() => { output_path = Some(PathBuf::from(&args[i + 1])); i += 2; }
            "--ffmpeg" if i + 1 < args.len() => { ffmpeg_bin = Some(args[i + 1].clone()); i += 2; }
            "--fps" if i + 1 < args.len() => { fps = args[i + 1].parse().unwrap_or(30.0); i += 2; }
            "--width" if i + 1 < args.len() => { width_arg = args[i + 1].parse().unwrap_or(WIDTH); i += 2; }
            "--height" if i + 1 < args.len() => { height_arg = args[i + 1].parse().unwrap_or(HEIGHT); i += 2; }
            "--still" if i + 1 < args.len() => { still_frame = Some(args[i + 1].parse().unwrap_or(0)); i += 2; }
            "--no-nvenc" => { no_nvenc = true; i += 1; }
            "-h" | "--help" => { print_usage(); return Ok(()); }
            other => {
                eprintln!("Unknown arg: {}", other);
                print_usage();
                std::process::exit(2);
            }
        }
    }

    if let Some(svg_file) = svg_path {
        let t0 = Instant::now();
        let out_file = output_path.ok_or("Missing --output")?;
        if let Some(parent) = out_file.parent() {
            fs::create_dir_all(parent)?;
        }
        let raw_svg = fs::read_to_string(&svg_file)?;
        let normalized = raw_svg.replace("NaraDisplay", "Outfit").replace("NaraSans", "Roboto");
        let fonts_dir = public_dir
            .as_ref()
            .map(|d| d.join("fonts"))
            .filter(|p| p.exists() && p.join("Outfit-Black.ttf").exists())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| {
                if std::path::Path::new("packages/remotion/public/fonts/Outfit-Black.ttf").exists() {
                    "packages/remotion/public/fonts".to_string()
                } else {
                    "packages/hyperframes/assets/fonts".to_string()
                }
            });
        let fontdb = load_font_database(&fonts_dir);
        let mut opt = usvg::Options::default();
        opt.fontdb = fontdb;
        let tree = usvg::Tree::from_str(&normalized, &opt)?;
        let sz = tree.size();
        let sx = width_arg as f32 / sz.width().max(1.0);
        let sy = height_arg as f32 / sz.height().max(1.0);
        let mut pixmap = Pixmap::new(width_arg, height_arg).ok_or("Invalid thumbnail size")?;
        resvg::render(&tree, Transform::from_scale(sx, sy), &mut pixmap.as_mut());

        let chosen_ffmpeg = ffmpeg_bin.unwrap_or_else(|| "ffmpeg".to_string());
        let size_str = format!("{}x{}", width_arg, height_arg);
        let mut child = Command::new(&chosen_ffmpeg)
            .args([
                "-y",
                "-v",
                "error",
                "-f",
                "rawvideo",
                "-pixel_format",
                "rgba",
                "-video_size",
                &size_str,
                "-i",
                "pipe:0",
                "-frames:v",
                "1",
                &out_file.to_string_lossy(),
            ])
            .stdin(Stdio::piped())
            .spawn()?;
        child.stdin.as_mut().unwrap().write_all(pixmap.data())?;
        let st = child.wait()?;
        if !st.success() {
            return Err("ffmpeg thumbnail encode failed".into());
        }
        eprintln!(
            "[fast-render] svg {} -> {} ({}) in {:.1}ms",
            svg_file.display(),
            out_file.display(),
            size_str,
            t0.elapsed().as_secs_f64() * 1000.0
        );
        return Ok(());
    }

    let props_file = props_path.ok_or("Missing --props")?;
    let out_file = output_path.ok_or("Missing --output")?;
    let props_json = fs::read_to_string(&props_file)?;
    let props: RemotionProps = serde_json::from_str(&props_json)?;

    let fonts_dir = public_dir
        .as_ref()
        .map(|d| d.join("fonts"))
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "packages/remotion/public/fonts".to_string());

    let t0 = Instant::now();
    let renderer = SceneRenderer::new(&props, &fonts_dir);

    if let Some(sf) = still_frame {
        let rgba = renderer.rasterize_frame(&props, sf, fps);
        let ff_args = vec![
            "-y".to_string(),
            "-v".to_string(),
            "error".to_string(),
            "-f".to_string(),
            "rawvideo".to_string(),
            "-pixel_format".to_string(),
            "rgba".to_string(),
            "-video_size".to_string(),
            "1080x1920".to_string(),
            "-i".to_string(),
            "pipe:0".to_string(),
            "-frames:v".to_string(),
            "1".to_string(),
            out_file.to_string_lossy().to_string(),
        ];
        let mut child = Command::new("ffmpeg")
            .args(&ff_args)
            .stdin(Stdio::piped())
            .spawn()?;
        child.stdin.as_mut().unwrap().write_all(&rgba)?;
        let st = child.wait()?;
        if !st.success() {
            return Err("ffmpeg still encode failed".into());
        }
        eprintln!("[fast-render] still frame {} done in {:.2}ms", sf, t0.elapsed().as_secs_f64() * 1000.0);
        return Ok(());
    }

    let total_frames: u32 = props
        .shots
        .iter()
        .map(|s| s.start_frame + s.duration_in_frames)
        .max()
        .unwrap_or(150);

    let audio_path = props.audio_src.as_ref().and_then(|rel| {
        public_dir.as_ref().map(|d| d.join(rel)).filter(|p| p.exists())
    });

    let chosen_ffmpeg = ffmpeg_bin.unwrap_or_else(find_remotion_ffmpeg);
    let wsl_lib = std::path::Path::new("/usr/lib/wsl/lib");
    let use_nvenc = !no_nvenc && std::path::Path::new("/usr/lib/wsl/lib/libnvidia-encode.so.1").exists();
    let prev_ld = env::var("LD_LIBRARY_PATH").unwrap_or_default();
    let new_ld = if wsl_lib.exists() {
        if prev_ld.is_empty() { "/usr/lib/wsl/lib".to_string() } else { format!("/usr/lib/wsl/lib:{}", prev_ld) }
    } else {
        prev_ld
    };

    if let Some(parent) = out_file.parent() {
        fs::create_dir_all(parent)?;
    }

fn write_avi_stream_header(
    out: &mut impl Write,
    width: u32,
    height: u32,
    fps: u32,
    total_frames: u32,
) -> std::io::Result<()> {
    let frame_bytes = width * height * 3;
    let usec_per_frame = 1_000_000 / fps.max(1);

    let mut hdrl = Vec::with_capacity(256);
    hdrl.extend_from_slice(b"hdrl");
    // avih chunk (56 bytes payload)
    hdrl.extend_from_slice(b"avih");
    hdrl.extend_from_slice(&56u32.to_le_bytes());
    hdrl.extend_from_slice(&usec_per_frame.to_le_bytes());
    hdrl.extend_from_slice(&(frame_bytes * fps).to_le_bytes());
    hdrl.extend_from_slice(&0u32.to_le_bytes()); // padding
    hdrl.extend_from_slice(&0x10u32.to_le_bytes()); // AVIF_HASINDEX=0, trust frames
    hdrl.extend_from_slice(&total_frames.to_le_bytes());
    hdrl.extend_from_slice(&0u32.to_le_bytes()); // initialFrames
    hdrl.extend_from_slice(&1u32.to_le_bytes()); // streams
    hdrl.extend_from_slice(&frame_bytes.to_le_bytes()); // suggestedBufferSize
    hdrl.extend_from_slice(&width.to_le_bytes());
    hdrl.extend_from_slice(&height.to_le_bytes());
    hdrl.extend_from_slice(&[0u8; 16]); // reserved

    // strl LIST
    let mut strl = Vec::with_capacity(140);
    strl.extend_from_slice(b"strl");
    // strh chunk (56 bytes)
    strl.extend_from_slice(b"strh");
    strl.extend_from_slice(&56u32.to_le_bytes());
    strl.extend_from_slice(b"vids");
    strl.extend_from_slice(&[0u8; 4]); // BI_RGB uncompressed
    strl.extend_from_slice(&0u32.to_le_bytes()); // flags
    strl.extend_from_slice(&0u16.to_le_bytes()); // priority
    strl.extend_from_slice(&0u16.to_le_bytes()); // language
    strl.extend_from_slice(&0u32.to_le_bytes()); // initialFrames
    strl.extend_from_slice(&1u32.to_le_bytes()); // scale
    strl.extend_from_slice(&fps.to_le_bytes()); // rate
    strl.extend_from_slice(&0u32.to_le_bytes()); // start
    strl.extend_from_slice(&total_frames.to_le_bytes()); // length
    strl.extend_from_slice(&frame_bytes.to_le_bytes()); // suggestedBufferSize
    strl.extend_from_slice(&0u32.to_le_bytes()); // quality
    strl.extend_from_slice(&0u32.to_le_bytes()); // sampleSize
    strl.extend_from_slice(&0i16.to_le_bytes()); // left
    strl.extend_from_slice(&0i16.to_le_bytes()); // top
    strl.extend_from_slice(&(width as i16).to_le_bytes()); // right
    strl.extend_from_slice(&(height as i16).to_le_bytes()); // bottom

    // strf chunk (40 bytes BITMAPINFOHEADER, negative height = top-down)
    strl.extend_from_slice(b"strf");
    strl.extend_from_slice(&40u32.to_le_bytes());
    strl.extend_from_slice(&40u32.to_le_bytes()); // biSize
    strl.extend_from_slice(&(width as i32).to_le_bytes());
    strl.extend_from_slice(&(-(height as i32)).to_le_bytes()); // top-down BGR24
    strl.extend_from_slice(&1u16.to_le_bytes()); // planes
    strl.extend_from_slice(&24u16.to_le_bytes()); // bpp
    strl.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
    strl.extend_from_slice(&frame_bytes.to_le_bytes()); // biSizeImage
    strl.extend_from_slice(&[0u8; 16]);

    hdrl.extend_from_slice(b"LIST");
    hdrl.extend_from_slice(&(strl.len() as u32).to_le_bytes());
    hdrl.extend_from_slice(&strl);

    out.write_all(b"RIFF")?;
    out.write_all(&0xFFFF_FFFFu32.to_le_bytes())?;
    out.write_all(b"AVI ")?;
    out.write_all(b"LIST")?;
    out.write_all(&(hdrl.len() as u32).to_le_bytes())?;
    out.write_all(&hdrl)?;
    out.write_all(b"LIST")?;
    out.write_all(&0xFFFF_FFFFu32.to_le_bytes())?;
    out.write_all(b"movi")?;
    Ok(())
}

    let spawn_ffmpeg = |with_nvenc: bool| -> std::io::Result<std::process::Child> {
        let mut cmd = Command::new(&chosen_ffmpeg);
        cmd.env("LD_LIBRARY_PATH", &new_ld);
        let mut ff_args = vec![
            "-y".to_string(),
            "-v".to_string(),
            "error".to_string(),
            "-f".to_string(),
            "avi".to_string(),
            "-i".to_string(),
            "pipe:0".to_string(),
        ];
        if let Some(ref ap) = audio_path {
            ff_args.push("-i".to_string());
            ff_args.push(ap.to_string_lossy().to_string());
        }
        ff_args.push("-map".to_string());
        ff_args.push("0:v".to_string());
        if audio_path.is_some() {
            ff_args.push("-map".to_string());
            ff_args.push("1:a".to_string());
        }
        if with_nvenc {
            ff_args.extend([
                "-c:v", "h264_nvenc",
                "-preset", "p5",
                "-profile:v", "high",
                "-rc", "vbr",
                "-cq", "28",
                "-b:v", "0",
                "-maxrate", "1100k",
                "-bufsize", "2200k",
                "-bf", "3",
                "-b_ref_mode", "middle",
                "-spatial-aq", "1",
                "-temporal-aq", "1",
                "-g", "60",
            ].map(String::from));
        } else {
            ff_args.extend([
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-tune", "animation",
                "-profile:v", "high",
                "-crf", "23",
                "-maxrate", "1100k",
                "-bufsize", "2200k",
                "-g", "60",
            ].map(String::from));
        }
        ff_args.extend(["-pix_fmt", "yuv420p"].map(String::from));
        if audio_path.is_some() {
            ff_args.extend(["-c:a", "aac", "-b:a", "160k", "-shortest"].map(String::from));
        }
        ff_args.extend(["-movflags", "+faststart"].map(String::from));
        ff_args.push(out_file.to_string_lossy().to_string());
        cmd.args(&ff_args).stdin(Stdio::piped()).stderr(Stdio::inherit());
        cmd.spawn()
    };

    let mut child = spawn_ffmpeg(use_nvenc)?;
    let mut writer_stdin = std::io::BufWriter::with_capacity(8 * 1024 * 1024, child.stdin.take().unwrap());
    write_avi_stream_header(&mut writer_stdin, WIDTH, HEIGHT, fps as u32, total_frames)?;

    let stage_pool = BufferPool::new((WIDTH as usize) * (HEIGHT as usize) * 3);
    let cap_pool = BufferPool::new((WIDTH as usize) * (CAP_H as usize) * 4);

    type BatchItem = (Arc<PooledBuf>, Option<Arc<PooledBuf>>, String, String);
    let (tx, rx) = mpsc::sync_channel::<Vec<BatchItem>>(2);

    let writer_handle = std::thread::spawn(move || -> std::io::Result<()> {
        let mut cap_strip_buf = vec![0u8; CAP_STRIP_BYTES];
        let mut last_strip_keys: (String, String) = (String::new(), String::new());
        let frame_chunk_hdr: [u8; 8] = {
            let mut b = [0u8; 8];
            b[0..4].copy_from_slice(b"00dc");
            b[4..8].copy_from_slice(&(WIDTH * HEIGHT * 3u32).to_le_bytes());
            b
        };
        for batch in rx {
            for (stage_arc, cap_opt, sk, ck) in batch {
                writer_stdin.write_all(&frame_chunk_hdr)?;
                match cap_opt {
                    None => {
                        writer_stdin.write_all(&stage_arc)?;
                    }
                    Some(cap_arc) => {
                        if last_strip_keys.0 != sk || last_strip_keys.1 != ck {
                            cap_strip_buf.copy_from_slice(&stage_arc[STAGE_SLICE1_END..STAGE_SLICE2_END]);
                            composite_caption_onto_bgr24(&mut cap_strip_buf, &cap_arc);
                            last_strip_keys = (sk, ck);
                        }
                        writer_stdin.write_all(&stage_arc[..STAGE_SLICE1_END])?;
                        writer_stdin.write_all(&cap_strip_buf)?;
                        writer_stdin.write_all(&stage_arc[STAGE_SLICE2_END..])?;
                    }
                }
            }
        }
        writer_stdin.flush()?;
        Ok(())
    });

    // Stream frames in 32-frame bounded batches using pooled buffers + split Stage/Caption caches
    let batch_size = 32u32;
    let mut stage_cache_order: VecDeque<String> = VecDeque::new();
    let mut stage_cache: HashMap<String, Arc<PooledBuf>> = HashMap::new();
    let mut cap_cache_order: VecDeque<String> = VecDeque::new();
    let mut cap_cache: HashMap<String, Option<Arc<PooledBuf>>> = HashMap::new();
    cap_cache.insert("cap:empty".to_string(), None);

    let mut unique_stages = 0u32;
    let mut unique_caps = 0u32;

    let mut start_f = 0u32;
    while start_f < total_frames {
        let end_f = (start_f + batch_size).min(total_frames);
        let batch_keys: Vec<(u32, (String, bool), (String, bool))> = (start_f..end_f)
            .map(|f| (
                f,
                renderer.build_stage_state_key(&props, f, fps),
                renderer.build_caption_state_key(&props, f, fps),
            ))
            .collect();

        let mut need_stages: HashMap<String, (u32, bool)> = HashMap::new();
        let mut need_caps: HashMap<String, (u32, bool)> = HashMap::new();
        for (f, (sk, s_reuse), (ck, c_reuse)) in &batch_keys {
            if !stage_cache.contains_key(sk) {
                need_stages.entry(sk.clone()).or_insert((*f, *s_reuse));
            }
            if !cap_cache.contains_key(ck) {
                need_caps.entry(ck.clone()).or_insert((*f, *c_reuse));
            }
        }
        unique_stages += need_stages.len() as u32;
        unique_caps += need_caps.len() as u32;

        let stage_tasks: Vec<(String, u32, bool)> = need_stages
            .into_iter()
            .map(|(k, (f, r))| (k, f, r))
            .collect();
        let cap_tasks: Vec<(String, u32, bool)> = need_caps
            .into_iter()
            .map(|(k, (f, r))| (k, f, r))
            .collect();

        let (stage_results, cap_results): (Vec<(String, bool, Arc<PooledBuf>)>, Vec<(String, bool, Option<Arc<PooledBuf>>)>) = rayon::join(
            || {
                stage_tasks
                    .into_par_iter()
                    .map(|(k, f, reuse)| {
                        let mut buf = stage_pool.take();
                        renderer.rasterize_stage_bgr24_into(&props, f, fps, buf.as_mut_slice());
                        (k, reuse, Arc::new(buf))
                    })
                    .collect()
            },
            || {
                cap_tasks
                    .into_par_iter()
                    .map(|(k, f, reuse)| {
                        let mut buf = cap_pool.take();
                        let has_cap = renderer.rasterize_caption_rgba_into(&props, f, fps, buf.as_mut_slice());
                        let opt = if has_cap { Some(Arc::new(buf)) } else { None };
                        (k, reuse, opt)
                    })
                    .collect()
            },
        );

        let mut batch_stages: HashMap<String, Arc<PooledBuf>> = HashMap::with_capacity(stage_results.len());
        for (k, reuse, arc) in stage_results {
            if reuse {
                if stage_cache.len() >= 8 {
                    if let Some(old_k) = stage_cache_order.pop_front() {
                        stage_cache.remove(&old_k);
                    }
                }
                stage_cache_order.push_back(k.clone());
                stage_cache.insert(k.clone(), Arc::clone(&arc));
            }
            batch_stages.insert(k, arc);
        }

        let mut batch_caps: HashMap<String, Option<Arc<PooledBuf>>> = HashMap::with_capacity(cap_results.len());
        for (k, reuse, arc_opt) in cap_results {
            if reuse {
                if cap_cache.len() >= 24 {
                    if let Some(old_k) = cap_cache_order.pop_front() {
                        cap_cache.remove(&old_k);
                    }
                }
                cap_cache_order.push_back(k.clone());
                cap_cache.insert(k.clone(), arc_opt.clone());
            }
            batch_caps.insert(k, arc_opt);
        }

        let mut batch_out: Vec<BatchItem> = Vec::with_capacity(batch_keys.len());
        for (_f, (sk, _), (ck, _)) in batch_keys {
            let stage_arc = stage_cache
                .get(&sk)
                .or_else(|| batch_stages.get(&sk))
                .expect("stage rasterized")
                .clone();
            let cap_opt = if ck == "cap:empty" {
                None
            } else {
                cap_cache
                    .get(&ck)
                    .or_else(|| batch_caps.get(&ck))
                    .and_then(|o| o.as_ref().map(Arc::clone))
            };
            batch_out.push((stage_arc, cap_opt, sk, ck));
        }
        tx.send(batch_out).map_err(|_| "writer channel closed")?;
        start_f = end_f;
    }

    drop(tx);
    writer_handle
        .join()
        .map_err(|_| "writer thread panicked")??;

    let status = child.wait()?;
    if !status.success() {
        return Err(format!("FFmpeg encode exited with status: {}", status).into());
    }

    eprintln!(
        "[fast-render] {} frames (stages={}, captions={}) nvenc={} in {:.2}s",
        total_frames,
        unique_stages,
        unique_caps,
        use_nvenc,
        t0.elapsed().as_secs_f64()
    );
    Ok(())
}
