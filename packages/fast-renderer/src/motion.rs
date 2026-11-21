use crate::types::{BeatTiming, CameraKeyframe, WordTiming};

pub fn easing_out_cubic(t: f64) -> f64 {
    let u = 1.0 - t.clamp(0.0, 1.0);
    1.0 - u * u * u
}

pub fn easing_in_out_cubic(t: f64) -> f64 {
    let x = t.clamp(0.0, 1.0);
    if x < 0.5 {
        4.0 * x * x * x
    } else {
        1.0 - (-2.0 * x + 2.0).powi(3) / 2.0
    }
}

pub fn interpolate(val: f64, in_min: f64, in_max: f64, out_min: f64, out_max: f64, ease: fn(f64) -> f64) -> f64 {
    if (in_max - in_min).abs() < 1e-9 {
        return out_max;
    }
    let raw_t = ((val - in_min) / (in_max - in_min)).clamp(0.0, 1.0);
    let e = ease(raw_t);
    out_min + (out_max - out_min) * e
}

pub fn linear(t: f64) -> f64 {
    t
}

/// Exact analytical spring solver matching Remotion's damped harmonic oscillator.
pub fn remotion_spring(frame: f64, fps: f64, damping: f64, stiffness: f64, mass: f64) -> f64 {
    if frame <= 0.0 {
        return 0.0;
    }
    let t = frame / fps.max(1.0);
    let omega0 = (stiffness / mass).sqrt();
    let zeta = damping / (2.0 * (stiffness * mass).sqrt());

    if zeta < 1.0 {
        let omega_d = omega0 * (1.0 - zeta * zeta).sqrt();
        let envelope = (-zeta * omega0 * t).exp();
        let val = 1.0 - envelope * ((zeta * omega0 / omega_d) * (omega_d * t).sin() + (omega_d * t).cos());
        if (1.0 - val).abs() < 1e-4 && envelope < 1e-3 { 1.0 } else { val }
    } else if (zeta - 1.0).abs() < 1e-6 {
        let envelope = (-omega0 * t).exp();
        1.0 - envelope * (1.0 + omega0 * t)
    } else {
        let s1 = -omega0 * (zeta - (zeta * zeta - 1.0).sqrt());
        let s2 = -omega0 * (zeta + (zeta * zeta - 1.0).sqrt());
        1.0 - (s2 * (s1 * t).exp() - s1 * (s2 * t).exp()) / (s2 - s1)
    }
}

pub fn interpolate_camera(keyframes: &[CameraKeyframe], local_frame: u32, fps: f64) -> (f64, f64, f64) {
    if keyframes.is_empty() {
        return (0.0, 0.0, 1.0);
    }
    let mut sorted = keyframes.to_vec();
    sorted.sort_by(|a, b| a.at_ms.total_cmp(&b.at_ms));
    if sorted.len() == 1 {
        return (sorted[0].x, sorted[0].y, sorted[0].scale);
    }
    let current_ms = (local_frame as f64 / fps) * 1000.0;
    if current_ms <= sorted[0].at_ms {
        return (sorted[0].x, sorted[0].y, sorted[0].scale);
    }
    let last = &sorted[sorted.len() - 1];
    if current_ms >= last.at_ms {
        return (last.x, last.y, last.scale);
    }
    for pair in sorted.windows(2) {
        let a = &pair[0];
        let b = &pair[1];
        if current_ms >= a.at_ms && current_ms <= b.at_ms {
            let span = (b.at_ms - a.at_ms).max(1.0);
            let t = easing_in_out_cubic((current_ms - a.at_ms) / span);
            return (
                a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.scale + (b.scale - a.scale) * t,
            );
        }
    }
    (0.0, 0.0, 1.0)
}

#[derive(Debug, Clone)]
pub struct PhraseChunk {
    pub words: Vec<WordTiming>,
    pub start_ms: f64,
    pub end_ms: f64,
}

fn find_beat_index(ms: f64, beats: &[BeatTiming]) -> Option<usize> {
    beats.iter().position(|b| ms >= b.start_ms && ms <= b.end_ms)
}

pub fn build_chunks(words: &[WordTiming], beats: &[BeatTiming]) -> Vec<PhraseChunk> {
    if words.is_empty() {
        return vec![];
    }
    let mut chunks: Vec<PhraseChunk> = Vec::new();
    let mut buf: Vec<WordTiming> = Vec::new();
    let mut char_count = 0usize;
    let mut buf_beat = find_beat_index(words[0].start_ms, beats);

    let flush = |chunks: &mut Vec<PhraseChunk>, buf: &mut Vec<WordTiming>, char_count: &mut usize| {
        if buf.is_empty() {
            return;
        }
        let start_ms = buf[0].start_ms;
        let end_ms = buf[buf.len() - 1].end_ms;
        chunks.push(PhraseChunk {
            words: std::mem::take(buf),
            start_ms,
            end_ms,
        });
        *char_count = 0;
    };

    for w in words {
        let w_beat = find_beat_index(w.start_ms, beats);
        let next_len = char_count + usize::from(!buf.is_empty()) + w.word.len();
        let gap_ms = buf.last().map(|prev| w.start_ms - prev.end_ms).unwrap_or(0.0);

        let beat_changed = matches!((w_beat, buf_beat), (Some(wb), Some(bb)) if wb != bb);
        if !buf.is_empty() && (buf.len() >= 4 || next_len > 25 || beat_changed || gap_ms > 280.0) {
            flush(&mut chunks, &mut buf, &mut char_count);
            buf_beat = w_beat;
        }

        if buf.is_empty() {
            buf_beat = w_beat;
        }
        let space = usize::from(!buf.is_empty());
        buf.push(w.clone());
        char_count += space + w.word.len();

        let trimmed = w.word.trim();
        if trimmed.ends_with('.')
            || trimmed.ends_with('!')
            || trimmed.ends_with('?')
            || trimmed.ends_with(',')
            || trimmed.ends_with(';')
            || trimmed.ends_with(':')
        {
            flush(&mut chunks, &mut buf, &mut char_count);
        }
    }
    flush(&mut chunks, &mut buf, &mut char_count);

    for i in 0..chunks.len().saturating_sub(1) {
        let cur_start = chunks[i].start_ms;
        let nxt_start = chunks[i + 1].start_ms;
        let gap = nxt_start - chunks[i].end_ms;
        if gap > 0.0
            && gap <= 320.0
            && find_beat_index(cur_start, beats) == find_beat_index(nxt_start, beats)
        {
            chunks[i].end_ms = nxt_start;
        }
    }
    if let Some(last) = chunks.last_mut() {
        last.end_ms += 250.0;
    }
    chunks
}
