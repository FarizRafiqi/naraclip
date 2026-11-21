use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, OnceLock};
use rayon::prelude::*;
use regex::Regex;
use resvg::tiny_skia::{BlendMode, FilterQuality, Pixmap, PixmapMut, PixmapPaint, Transform};
use resvg::usvg::{self, fontdb};

use crate::motion::{
    build_chunks, easing_in_out_cubic, easing_out_cubic, interpolate, interpolate_camera, linear,
    remotion_spring, PhraseChunk,
};
use crate::types::{CommandItem, RemotionProps, ShotItem};

pub const WIDTH: u32 = 1080;
pub const HEIGHT: u32 = 1920;
pub const CAP_Y: u32 = 1310;
pub const CAP_H: u32 = 340;
pub const STAGE_SLICE1_END: usize = (CAP_Y as usize) * (WIDTH as usize) * 3;
pub const STAGE_SLICE2_END: usize = ((CAP_Y + CAP_H) as usize) * (WIDTH as usize) * 3;
pub const CAP_STRIP_BYTES: usize = (CAP_H as usize) * (WIDTH as usize) * 3;

thread_local! {
    static STAGE_PIXMAP: RefCell<Option<Pixmap>> = const { RefCell::new(None) };
}

pub fn composite_caption_onto_bgr24(cap_strip_bgr: &mut [u8], cap_rgba: &[u8]) {
    for (cap, dst) in cap_rgba.chunks_exact(4).zip(cap_strip_bgr.chunks_exact_mut(3)) {
        let a = cap[3];
        if a == 0 {
            continue;
        }
        if a == 255 {
            dst[0] = cap[2];
            dst[1] = cap[1];
            dst[2] = cap[0];
        } else {
            let inv = 255u16 - a as u16;
            let b_bg = (inv * dst[0] as u16 + 127) / 255;
            let g_bg = (inv * dst[1] as u16 + 127) / 255;
            let r_bg = (inv * dst[2] as u16 + 127) / 255;
            dst[0] = (cap[2] as u16 + b_bg).min(255) as u8;
            dst[1] = (cap[1] as u16 + g_bg).min(255) as u8;
            dst[2] = (cap[0] as u16 + r_bg).min(255) as u8;
        }
    }
}

fn composite_caption_onto_pixmap(pixmap: &mut Pixmap, cap_rgba: &[u8]) {
    let start_byte = (CAP_Y as usize) * (WIDTH as usize) * 4;
    let strip = &mut pixmap.data_mut()[start_byte..start_byte + cap_rgba.len()];
    for (cap, dst) in cap_rgba.chunks_exact(4).zip(strip.chunks_exact_mut(4)) {
        let a = cap[3];
        if a == 0 {
            continue;
        }
        if a == 255 {
            dst.copy_from_slice(cap);
        } else {
            let inv = 255u16 - a as u16;
            dst[0] = (cap[0] as u16 + (inv * dst[0] as u16 + 127) / 255).min(255) as u8;
            dst[1] = (cap[1] as u16 + (inv * dst[1] as u16 + 127) / 255).min(255) as u8;
            dst[2] = (cap[2] as u16 + (inv * dst[2] as u16 + 127) / 255).min(255) as u8;
        }
    }
}

#[derive(Debug, Clone)]
enum SvgPiece {
    Literal(String),
    AnimTag {
        original_prefix: String,
        attr_name: String, // "data-anim" or "data-cue*"
        attr_val: String,
        original_suffix: String,
        cx: f64,
        cy: f64,
        has_dasharray: bool,
        existing_transform: Option<String>,
    },
}

#[derive(Debug, Clone)]
pub struct PreparedShotSvg {
    vb_x: f64,
    vb_y: f64,
    vb_w: f64,
    vb_h: f64,
    pieces: Vec<SvgPiece>,
    inner_body_only: bool,
}

fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

fn normalize_fonts_in_svg(svg: &str) -> String {
    svg.replace("NaraDisplay", "Outfit")
        .replace("NaraSans", "Roboto")
}

pub fn load_font_database(fonts_dir: &str) -> Arc<fontdb::Database> {
    let mut db = fontdb::Database::new();
    let files = [
        format!("{}/Outfit-Black.ttf", fonts_dir),
        format!("{}/Roboto-Bold.ttf", fonts_dir),
        "/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf".to_string(),
        "/usr/share/fonts/truetype/noto/NotoSansMono-Bold.ttf".to_string(),
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf".to_string(),
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf".to_string(),
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf".to_string(),
        "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf".to_string(),
    ];
    for f in &files {
        if std::path::Path::new(f).exists() {
            let _ = db.load_font_file(f);
        }
    }
    db.set_sans_serif_family("Liberation Sans");
    db.set_monospace_family("Noto Sans Mono");
    Arc::new(db)
}

fn find_node_center(node: &usvg::Node, id: &str) -> Option<(f64, f64)> {
    if node.id() == id {
        let bbox = node.bounding_box();
        return Some((
            (bbox.left() + bbox.right()) as f64 * 0.5,
            (bbox.top() + bbox.bottom()) as f64 * 0.5,
        ));
    }
    if let usvg::Node::Group(ref g) = node {
        for child in g.children() {
            if let Some(c) = find_node_center(child, id) {
                return Some(c);
            }
        }
    }
    None
}

fn find_tree_center(tree: &usvg::Tree, id: &str) -> (f64, f64) {
    for child in tree.root().children() {
        if let Some(c) = find_node_center(child, id) {
            return c;
        }
    }
    (0.0, 0.0)
}

pub fn prepare_shot_svg(raw_svg: &str, fontdb: &Arc<fontdb::Database>) -> Option<PreparedShotSvg> {
    let normalized = normalize_fonts_in_svg(raw_svg);
    let vb_re = Regex::new(r#"viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']"#).unwrap();
    let (vb_x, vb_y, vb_w, vb_h) = vb_re
        .captures(&normalized)
        .and_then(|c| {
            Some((
                c[1].parse::<f64>().ok()?,
                c[2].parse::<f64>().ok()?,
                c[3].parse::<f64>().ok()?,
                c[4].parse::<f64>().ok()?,
            ))
        })
        .unwrap_or((0.0, 0.0, 980.0, 1120.0));

    // Extract inner contents of <svg ...>...</svg>
    let open_end = normalized.find('>')?;
    let close_start = normalized.rfind("</svg>")?;
    let inner = &normalized[open_end + 1..close_start];

    let tag_re = Regex::new(r#"<([a-zA-Z0-9:_-]+)([^>]*\b(data-(?:anim|cue(?:-[a-z]+)?))=["']([^"']+)["'][^>]*)>"#).unwrap();
    let xform_re = Regex::new(r#"\btransform=["']([^"']+)["']"#).unwrap();
    let id_re = Regex::new(r#"\bid=["']([^"']+)["']"#).unwrap();

    // Build probe SVG injecting temporary id="__nc_k" to compute true local bbox centers via usvg once per shot
    let mut probe_inner = String::with_capacity(inner.len() + 256);
    let mut last_idx = 0usize;
    let mut matches_meta: Vec<(usize, usize, String, String, String, String, bool, Option<String>)> = Vec::new();
    let mut k = 0usize;

    for cap in tag_re.captures_iter(inner) {
        let full_m = cap.get(0).unwrap();
        let tag_name = cap.get(1).unwrap().as_str();
        let attrs = cap.get(2).unwrap().as_str();
        let attr_name = cap.get(3).unwrap().as_str().to_string();
        let attr_val = cap.get(4).unwrap().as_str().to_string();
        let has_dasharray = attrs.contains("stroke-dasharray");
        let existing_transform = xform_re.captures(attrs).map(|c| c[1].to_string());

        let cleaned_attrs = if existing_transform.is_some() {
            xform_re.replace(attrs, "").to_string()
        } else {
            attrs.to_string()
        };

        probe_inner.push_str(&inner[last_idx..full_m.start()]);
        let tmp_id = format!("__nc_{}", k);
        if id_re.is_match(attrs) {
            let replaced = id_re.replace(&cleaned_attrs, format!(r#"id="{}""#, tmp_id)).to_string();
            probe_inner.push_str(&format!("<{}{}>", tag_name, replaced));
        } else {
            probe_inner.push_str(&format!("<{} id=\"{}\"{}>", tag_name, tmp_id, cleaned_attrs));
        }

        let clean_tag_attrs = if id_re.is_match(&cleaned_attrs) {
            cleaned_attrs
        } else {
            cleaned_attrs
        };

        matches_meta.push((
            full_m.start(),
            full_m.end(),
            format!("<{}", tag_name),
            attr_name,
            attr_val,
            clean_tag_attrs,
            has_dasharray,
            existing_transform,
        ));
        last_idx = full_m.end();
        k += 1;
    }
    probe_inner.push_str(&inner[last_idx..]);

    let probe_svg = format!(
        "<svg viewBox=\"{} {} {} {}\" xmlns=\"http://www.w3.org/2000/svg\">{}</svg>",
        vb_x, vb_y, vb_w, vb_h, probe_inner
    );

    let mut opt = usvg::Options::default();
    opt.fontdb = Arc::clone(fontdb);
    let tree = usvg::Tree::from_str(&probe_svg, &opt).ok()?;

    let mut pieces = Vec::new();
    let mut cursor = 0usize;
    for (idx, (m_start, m_end, prefix, attr_name, attr_val, suffix, has_dasharray, existing_transform)) in
        matches_meta.into_iter().enumerate()
    {
        if m_start > cursor {
            pieces.push(SvgPiece::Literal(inner[cursor..m_start].to_string()));
        }
        let tmp_id = format!("__nc_{}", idx);
        let (cx, cy) = find_tree_center(&tree, &tmp_id);
        pieces.push(SvgPiece::AnimTag {
            original_prefix: prefix,
            attr_name,
            attr_val,
            original_suffix: suffix,
            cx,
            cy,
            has_dasharray,
            existing_transform,
        });
        cursor = m_end;
    }
    if cursor < inner.len() {
        pieces.push(SvgPiece::Literal(inner[cursor..].to_string()));
    }

    Some(PreparedShotSvg {
        vb_x,
        vb_y,
        vb_w,
        vb_h,
        pieces,
        inner_body_only: true,
    })
}

fn transform_around_center(cx: f64, cy: f64, tx: f64, ty: f64, sx: f64, sy: f64, deg: f64) -> String {
    let mut parts = Vec::new();
    if tx.abs() > 1e-3 || ty.abs() > 1e-3 {
        parts.push(format!("translate({:.2}, {:.2})", tx, ty));
    }
    if deg.abs() > 1e-3 || (sx - 1.0).abs() > 1e-4 || (sy - 1.0).abs() > 1e-4 {
        parts.push(format!("translate({:.2}, {:.2})", cx, cy));
        if deg.abs() > 1e-3 {
            parts.push(format!("rotate({:.2})", deg));
        }
        if (sx - 1.0).abs() > 1e-4 || (sy - 1.0).abs() > 1e-4 {
            parts.push(format!("scale({:.4}, {:.4})", sx, sy));
        }
        parts.push(format!("translate({:.2}, {:.2})", -cx, -cy));
    }
    parts.join(" ")
}

fn render_prepared_svg(
    prep: &PreparedShotSvg,
    shot: &ShotItem,
    local_frame: u32,
    fps: f64,
    box_x: f64,
    box_y: f64,
    box_w: f64,
    box_h: f64,
) -> String {
    let scale_x = box_w / prep.vb_w.max(1.0);
    let scale_y = box_h / prep.vb_h.max(1.0);
    let fit_scale = scale_x.min(scale_y);
    let render_w = prep.vb_w * fit_scale;
    let render_h = prep.vb_h * fit_scale;
    let offset_x = box_x + (box_w - render_w) * 0.5 - prep.vb_x * fit_scale;
    let offset_y = box_y + (box_h - render_h) * 0.5 - prep.vb_y * fit_scale;

    let lf = local_frame as f64;
    let pop_at = |delay: f64| -> (f64, f64, f64, f64) {
        let p = remotion_spring(lf - delay, fps, 18.0, 190.0, 0.6);
        let op = if lf < delay { 0.0 } else { (p * 1.45).clamp(0.0, 1.0) };
        let sc = if lf < delay { 0.88 } else { 0.88 + (1.0 - 0.88) * p };
        let ty = if lf < delay { 14.0 } else { 14.0 * (1.0 - p) };
        (op, 0.0, ty, sc)
    };
    let slide_up_at = |delay: f64| -> (f64, f64, f64, f64) {
        let p = remotion_spring(lf - delay, fps, 18.0, 175.0, 0.65);
        let op = if lf < delay { 0.0 } else { (p * 1.45).clamp(0.0, 1.0) };
        let ty = if lf < delay { 32.0 } else { 32.0 * (1.0 - p) };
        (op, 0.0, ty, 1.0)
    };
    let slide_right_at = |delay: f64| -> (f64, f64, f64, f64) {
        let p = remotion_spring(lf - delay, fps, 18.0, 175.0, 0.65);
        let op = if lf < delay { 0.0 } else { (p * 1.45).clamp(0.0, 1.0) };
        let tx = if lf < delay { -36.0 } else { -36.0 * (1.0 - p) };
        (op, tx, 0.0, 1.0)
    };
    let drop_at = |delay: f64, dist: f64| -> (f64, f64, f64, f64) {
        let p = remotion_spring(lf - delay, fps, 16.0, 180.0, 0.75);
        let op = if lf < delay { 0.0 } else { (p * 1.55).clamp(0.0, 1.0) };
        let ty = if lf < delay { dist } else { dist * (1.0 - p) };
        (op, 0.0, ty, 1.0)
    };
    let stamp_at = |delay: f64| -> (f64, f64, f64, f64) {
        let p = remotion_spring(lf - delay, fps, 16.0, 220.0, 0.55);
        let op = if lf < delay { 0.0 } else { (p * 2.2).clamp(0.0, 1.0) };
        let sc = if lf < delay { 1.16 } else { 1.16 + (1.0 - 1.16) * p };
        let age = lf - delay;
        let sx = if age >= 0.0 && age < 12.0 {
            (age * 2.4).sin() * (-age * 0.28).exp() * 4.0
        } else {
            0.0
        };
        (op, sx, 0.0, sc)
    };

    // Named cues
    let cue_ms = |id: &str, default_ms: f64| -> f64 {
        shot.cues
            .iter()
            .find(|c| c.id == id)
            .map(|c| (c.at_ms / 1000.0 * fps).round())
            .unwrap_or_else(|| (default_ms / 1000.0 * fps).round())
    };
    let load_cue_f = shot
        .cues
        .iter()
        .find(|c| c.id == "c-load" || c.id == "c-throw")
        .map(|c| (c.at_ms / 1000.0 * fps).round())
        .unwrap_or(55.0);
    let disk_stutter = if lf >= load_cue_f { ((lf - load_cue_f) * 1.45).sin() * 16.0 } else { 0.0 };
    let disk_deg = lf * 13.0 + disk_stutter;
    let arm_seek_deg = if lf < load_cue_f {
        (lf * 0.32).sin() * 10.0
    } else {
        (lf * 0.95).sin() * 17.0 + (lf * 2.1).cos() * 5.0
    };
    let slow_f = cue_ms("c-slowbar", 800.0);
    let fast_f = cue_ms("c-fastbar", 1500.0);
    let plunger_p = remotion_spring(lf, fps, 10.0, 260.0, 0.45);
    let plunger_ty = if lf < 14.0 {
        (plunger_p.min(1.0) * std::f64::consts::PI).sin() * 14.0
    } else {
        0.0
    };
    let slow_sweep_deg = interpolate(lf, slow_f, slow_f + 26.0, 0.0, 58.0, easing_out_cubic);
    let fast_snap_p = remotion_spring((lf - fast_f).max(0.0), fps, 11.0, 210.0, 0.55);
    let fast_sweep_deg = if lf < fast_f { 0.0 } else { 15.0 + (-58.0 - 15.0) * fast_snap_p };
    let flap_f = cue_ms("c-incr", 2400.0);
    let flap_dist = (lf - (flap_f + 3.0)).abs();
    let flap_scale_y = if lf >= flap_f && flap_dist < 6.0 {
        0.12 + (flap_dist / 6.0) * 0.88
    } else {
        1.0
    };
    let flow_dash = -(lf * 3.4);
    let float_y = (lf / 12.0).sin() * 8.0;
    let pulse_scale = 1.0 + (lf / 8.0).sin() * 0.045;
    let throw_f = cue_ms("c-throw", 1600.0);
    let arc_t = interpolate(lf, throw_f, throw_f + 18.0, 0.0, 1.0, easing_in_out_cubic);
    let arc_x = arc_t * 335.0;
    let arc_y = arc_t * 215.0 - (arc_t * std::f64::consts::PI).sin() * 115.0;
    let draw_dash = interpolate(lf, 8.0, 36.0, 900.0, 0.0, easing_out_cubic);

    let mut body = String::with_capacity(8192);
    let _ = prep.inner_body_only;
    for piece in &prep.pieces {
        match piece {
            SvgPiece::Literal(lit) => body.push_str(lit),
            SvgPiece::AnimTag {
                original_prefix,
                attr_name,
                attr_val,
                original_suffix,
                cx,
                cy,
                has_dasharray,
                existing_transform,
            } => {
                let mut opacity: Option<f64> = None;
                let mut tx = 0.0f64;
                let mut ty = 0.0f64;
                let mut sx = 1.0f64;
                let mut sy = 1.0f64;
                let mut deg = 0.0f64;
                let mut dash_offset: Option<f64> = None;
                let mut add_dasharray = false;

                if attr_name == "data-anim" {
                    match attr_val.as_str() {
                        "pop" => { let (o, x, y, s) = pop_at(3.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "pop-1" => { let (o, x, y, s) = pop_at(4.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "pop-2" => { let (o, x, y, s) = pop_at(14.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "pop-3" => { let (o, x, y, s) = pop_at(24.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "pop-4" => { let (o, x, y, s) = pop_at(34.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "pop-5" => { let (o, x, y, s) = pop_at(44.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "slide-up" => { let (o, x, y, s) = slide_up_at(5.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "slide-up-1" => { let (o, x, y, s) = slide_up_at(6.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "slide-up-2" => { let (o, x, y, s) = slide_up_at(18.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "slide-up-3" => { let (o, x, y, s) = slide_up_at(30.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "slide-right" => { let (o, x, y, s) = slide_right_at(6.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "drop" => { let (o, x, y, s) = drop_at(14.0, -72.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "arc-throw" => { tx = arc_x; ty = arc_y; }
                        "disk-spin" => { deg = disk_deg; }
                        "arm-seek" => { deg = arm_seek_deg; }
                        "plunger-press" => { ty = plunger_ty; }
                        "needle-slow" => { deg = slow_sweep_deg; }
                        "needle-fast" => { deg = fast_sweep_deg; }
                        "flap-flip" => { sy = flap_scale_y; }
                        "flow" => { dash_offset = Some(flow_dash); }
                        "draw" => { add_dasharray = !has_dasharray; dash_offset = Some(draw_dash); }
                        "float" => { ty = float_y; }
                        "pulse" => { sx = pulse_scale; sy = pulse_scale; }
                        "led-blink" => { opacity = Some(if local_frame % 18 < 10 { 1.0 } else { 0.35 }); }
                        "shake" => { let (o, x, y, s) = stamp_at(46.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        _ => {}
                    }
                } else if let Some(cue) = shot.cues.iter().find(|c| c.id == *attr_val) {
                    let delay = ((cue.at_ms / 1000.0) * fps).round().max(0.0);
                    match attr_name.as_str() {
                        "data-cue" => { let (o, x, y, s) = pop_at(delay); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "data-cue-slide" => { let (o, x, y, s) = slide_up_at(delay); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "data-cue-right" => { let (o, x, y, s) = slide_right_at(delay); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "data-cue-drop" => { let (o, x, y, s) = drop_at(delay, -72.0); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "data-cue-stamp" => { let (o, x, y, s) = stamp_at(delay); opacity = Some(o); tx = x; ty = y; sx = s; sy = s; }
                        "data-cue-draw" => {
                            let d = interpolate(lf, delay, delay + 18.0, 900.0, 0.0, easing_out_cubic);
                            opacity = Some(if lf < delay { 0.0 } else { 1.0 });
                            add_dasharray = !has_dasharray;
                            dash_offset = Some(d);
                        }
                        "data-cue-hide" => {
                            let p = remotion_spring(lf - delay, fps, 15.0, 200.0, 0.5);
                            opacity = Some(if lf < delay { 1.0 } else { (1.0 - p * 1.4).max(0.0) });
                            let s = if lf < delay { 1.0 } else { (1.0 - p * 0.45).max(0.55) };
                            sx = s;
                            sy = s;
                        }
                        "data-cue-dim" => {
                            let p = interpolate(lf, delay, delay + 6.0, 1.0, 0.35, linear);
                            opacity = Some(p);
                        }
                        _ => {}
                    }
                }

                let mut extra = String::new();
                if let Some(op) = opacity {
                    extra.push_str(&format!(r#" opacity="{:.3}""#, op));
                }
                let dyn_xform = transform_around_center(*cx, *cy, tx, ty, sx, sy, deg);
                let combined_xform = match (dyn_xform.is_empty(), existing_transform) {
                    (false, Some(ex)) => format!("{} {}", dyn_xform, ex),
                    (false, None) => dyn_xform,
                    (true, Some(ex)) => ex.clone(),
                    (true, None) => String::new(),
                };
                if !combined_xform.is_empty() {
                    extra.push_str(&format!(r#" transform="{}""#, combined_xform));
                }
                if add_dasharray {
                    extra.push_str(r#" stroke-dasharray="900""#);
                }
                if let Some(doff) = dash_offset {
                    extra.push_str(&format!(r#" stroke-dashoffset="{:.2}""#, doff));
                }

                body.push_str(original_prefix);
                body.push_str(&extra);
                body.push_str(original_suffix);
                body.push('>');
            }
        }
    }

    format!(
        r#"<g transform="translate({:.2}, {:.2}) scale({:.5})">{}</g>"#,
        offset_x, offset_y, fit_scale, body
    )
}

fn build_background_pixmap(is_ink: bool, fontdb: &Arc<fontdb::Database>) -> Pixmap {
    let bg = if is_ink { "#121820" } else { "#F4EFE6" };
    let edge = if is_ink { "rgba(6, 9, 13, 0.55)" } else { "rgba(212, 202, 186, 0.45)" };
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <radialGradient id="bgVig" cx="50%" cy="45%" r="58%">
      <stop offset="58%" stop-color="{bg}" stop-opacity="0"/>
      <stop offset="100%" stop-color="{edge}" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="{bg}"/>
  <rect width="1080" height="1920" fill="url(#bgVig)"/>
</svg>"##
    );
    let mut opt = usvg::Options::default();
    opt.fontdb = Arc::clone(fontdb);
    let tree = usvg::Tree::from_str(&svg, &opt).unwrap();
    let mut pixmap = Pixmap::new(WIDTH, HEIGHT).unwrap();
    resvg::render(&tree, usvg::Transform::identity(), &mut pixmap.as_mut());
    pixmap
}

struct WordSprite {
    pixmap: Pixmap,
}

fn measure_display_word_bytes(font_bytes: &[u8], word: &str, font_size: f64) -> f64 {
    if !font_bytes.is_empty() {
        if let Ok(face) = ttf_parser::Face::parse(font_bytes, 0) {
            let upem = face.units_per_em().max(1) as f64;
            let scale = font_size / upem;
            let mut adv_sum = 0.0f64;
            for ch in word.chars() {
                if let Some(gid) = face.glyph_index(ch) {
                    let adv = face.glyph_hor_advance(gid).unwrap_or((upem * 0.56) as u16) as f64;
                    adv_sum += adv * scale;
                } else {
                    adv_sum += font_size * 0.56;
                }
            }
            return adv_sum * 1.03 + 6.0;
        }
    }
    word.chars().count() as f64 * (font_size * 0.64)
}

pub struct SceneRenderer {
    base_opt: usvg::Options<'static>,
    bg_paper: Pixmap,
    bg_ink: Pixmap,
    chunks: Vec<PhraseChunk>,
    prepared_svgs: Vec<Option<PreparedShotSvg>>,
    outfit_font_bytes: Vec<u8>,
    word_sprites: HashMap<(String, bool, bool), WordSprite>,
}

impl SceneRenderer {
    pub fn new(props: &RemotionProps, fonts_dir: &str) -> Self {
        let fontdb = load_font_database(fonts_dir);
        let bg_paper = build_background_pixmap(false, &fontdb);
        let bg_ink = build_background_pixmap(true, &fontdb);
        let chunks = build_chunks(&props.words, &props.beats);
        let prepared_svgs = props
            .shots
            .iter()
            .map(|s| s.svg.as_deref().and_then(|svg| prepare_shot_svg(svg, &fontdb)))
            .collect();
        let outfit_font_bytes = std::fs::read(format!("{}/Outfit-Black.ttf", fonts_dir)).unwrap_or_default();
        let mut base_opt = usvg::Options::default();
        base_opt.fontdb = fontdb;

        let accent = props.accent_color.as_deref().unwrap_or("#1D63ED");
        let unique_words: Vec<String> = props
            .words
            .iter()
            .map(|w| w.word.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let has_ink_shot = props.shots.iter().any(|s| s.recipe == "code" || s.recipe == "terminal");
        let has_paper_shot = props.shots.iter().any(|s| s.recipe != "code" && s.recipe != "terminal");
        let mut sprite_specs: Vec<(String, bool, bool)> = Vec::new();
        for w in &unique_words {
            for &is_ink in &[false, true] {
                if (is_ink && !has_ink_shot) || (!is_ink && !has_paper_shot) {
                    continue;
                }
                sprite_specs.push((w.clone(), is_ink, false));
                sprite_specs.push((w.clone(), is_ink, true));
            }
        }
        let sprites_vec: Vec<((String, bool, bool), WordSprite)> = sprite_specs
            .into_par_iter()
            .map(|(word_str, is_ink, is_spoken)| {
                let ww = measure_display_word_bytes(&outfit_font_bytes, &word_str, 52.0);
                let sprite_w = (ww.ceil() as u32 + 40).max(40);
                let sprite_h = 112u32;
                let base_col = if is_ink { "#F4EFE6" } else { "#121820" };
                let stroke_col = if is_ink { "#121820" } else { "#F4EFE6" };
                let active_col = if is_ink { "#5EA8FF" } else { accent };
                let col = if is_spoken { active_col } else { base_col };
                let cx_local = sprite_w as f64 * 0.5;
                let y_local = 56.0 + 52.0 * 0.35;
                let svg = format!(
                    r##"<svg xmlns="http://www.w3.org/2000/svg" width="{}" height="{}" viewBox="0 0 {} {}"><text x="{:.1}" y="{:.1}" text-anchor="middle" fill="{}" stroke="{}" stroke-width="7" stroke-linejoin="round" paint-order="stroke fill" font-family="Outfit, Liberation Sans, sans-serif" font-size="52" font-weight="900">{}</text></svg>"##,
                    sprite_w, sprite_h, sprite_w, sprite_h, cx_local, y_local, col, stroke_col, xml_escape(&word_str)
                );
                let mut pixmap = Pixmap::new(sprite_w, sprite_h).unwrap();
                if let Ok(tree) = usvg::Tree::from_str(&svg, &base_opt) {
                    resvg::render(&tree, usvg::Transform::identity(), &mut pixmap.as_mut());
                }
                ((word_str, is_ink, is_spoken), WordSprite { pixmap })
            })
            .collect();
        let word_sprites: HashMap<(String, bool, bool), WordSprite> = sprites_vec.into_iter().collect();

        Self {
            base_opt,
            bg_paper,
            bg_ink,
            chunks,
            prepared_svgs,
            outfit_font_bytes,
            word_sprites,
        }
    }

    pub fn measure_display_word(&self, word: &str, font_size: f64) -> f64 {
        measure_display_word_bytes(&self.outfit_font_bytes, word, font_size)
    }

    pub fn background_for(&self, is_ink: bool) -> &[u8] {
        if is_ink {
            self.bg_ink.data()
        } else {
            self.bg_paper.data()
        }
    }

    fn render_code_block(
        shot: &ShotItem,
        local_frame: u32,
        fps: f64,
        has_svg: bool,
        fallback_code: &str,
    ) -> String {
        let code = shot.code.as_deref().unwrap_or(fallback_code);
        let title = shot.headline.as_deref().unwrap_or("cache.js");
        let lines: Vec<&str> = code.trim().split('\n').collect();
        let compact = has_svg;
        let max_len = lines.iter().map(|l| l.len()).max().unwrap_or(0);
        let font_size: f64 = if compact {
            if lines.len() > 8 { 23.0 } else { 26.0 }
        } else if lines.len() > 9 || max_len > 38 {
            26.0
        } else {
            30.0
        };
        let line_h = font_size * if compact { 1.55 } else { 1.72 };
        let header_h = if compact { 48.0 } else { 56.0 };
        let pad_top = if compact { 18.0 } else { 26.0 };

        // Word-wrap long lines to match 940px plate width (~720px code area when annotations exist)
        let max_cols = if shot.annotations.is_empty() { 46 } else { 37 };
        let mut line_rows: Vec<(usize, Vec<String>)> = Vec::new();
        let mut total_rows = 0usize;
        for (idx, &raw) in lines.iter().enumerate() {
            let mut wrapped = Vec::new();
            let trimmed_end = raw;
            if trimmed_end.chars().count() <= max_cols {
                wrapped.push(trimmed_end.to_string());
            } else {
                let mut cur = String::new();
                for word in trimmed_end.split_inclusive(' ') {
                    if cur.chars().count() + word.chars().count() > max_cols && !cur.is_empty() {
                        wrapped.push(cur.trim_end().to_string());
                        cur = format!("  {}", word.trim_start());
                    } else {
                        cur.push_str(word);
                    }
                }
                if !cur.is_empty() {
                    wrapped.push(cur);
                }
            }
            total_rows += wrapped.len().max(1);
            line_rows.push((idx, wrapped));
        }

        let box_h = header_h + pad_top * 2.0 + total_rows as f64 * line_h + 12.0;
        let top_y = if has_svg { 125.0 } else { 180.0 + (1060.0 - box_h) * 0.5 };
        let enter = remotion_spring(local_frame as f64, fps, 14.0, 150.0, 0.75);
        let ty = (1.0 - enter) * 20.0;

        let dur_f = shot.duration_in_frames.max(1) as f64;
        let reveal_span = (dur_f * 0.2).floor().clamp(10.0, 24.0);
        let per_line_delay = if lines.len() > 1 { reveal_span / lines.len() as f64 } else { 0.0 };

        let mut active_idx: Option<usize> = None;
        if !shot.highlight_steps.is_empty() {
            let mut steps = shot.highlight_steps.clone();
            steps.sort_by(|a, b| a.at_ms.total_cmp(&b.at_ms));
            for s in steps {
                if local_frame as f64 >= (s.at_ms / 1000.0 * fps).round() {
                    active_idx = Some(s.line.saturating_sub(1));
                }
            }
        }

        let kw: HashSet<&'static str> = [
            "const", "let", "await", "async", "return", "import", "export", "from", "if",
            "FROM", "WORKDIR", "COPY", "RUN", "EXPOSE", "CMD", "ENV", "ENTRYPOINT", "services",
            "image", "ports", "volumes",
        ]
        .into_iter()
        .collect();

        let mut out = format!(
            r##"<g transform="translate(70, {:.2})">
  <rect x="10" y="10" width="940" height="{:.1}" rx="6" fill="#090D12"/>
  <rect width="940" height="{:.1}" rx="6" fill="#171F2A" stroke="#2A3444" stroke-width="2"/>
  <path d="M 2 6 Q 2 2 6 2 H 934 Q 938 2 938 6 V {:.1} H 2 Z" fill="#1E2734"/>
  <line x1="2" y1="{:.1}" x2="938" y2="{:.1}" stroke="#2A3444" stroke-width="2"/>
  <text x="26" y="{:.1}" fill="#F4EFE6" font-family="Noto Sans Mono, Liberation Mono, monospace" font-size="20" font-weight="700">{}</text>
"##,
            top_y + ty,
            box_h,
            box_h,
            header_h,
            header_h,
            header_h,
            header_h * 0.64,
            xml_escape(title)
        );

        static TOKEN_RE: OnceLock<Regex> = OnceLock::new();
        let token_re = TOKEN_RE.get_or_init(|| Regex::new(r#"("[^"]*"|'[^']*'|\s+)"#).unwrap());
        let mut row_cursor = 0usize;
        for (idx, rows) in line_rows {
            let line_spring = remotion_spring(local_frame as f64 - idx as f64 * per_line_delay, fps, 16.0, 200.0, 0.45);
            let op = line_spring.clamp(0.0, 1.0);
            let ltx = (1.0 - line_spring) * 14.0;
            let is_hl = active_idx == Some(idx);
            let row_top = header_h + pad_top + row_cursor as f64 * line_h;
            let row_block_h = rows.len() as f64 * line_h;

            if is_hl {
                out.push_str(&format!(
                    r##"  <rect x="2" y="{:.1}" width="936" height="{:.1}" fill="#5EA8FF" fill-opacity="0.16"/>
  <rect x="2" y="{:.1}" width="5" height="{:.1}" fill="#5EA8FF"/>
"##,
                    row_top - 4.0, row_block_h, row_top - 4.0, row_block_h
                ));
            }

            let num_color = if is_hl { "#5EA8FF" } else { "#8E9BAE" };
            let num_weight = if is_hl { "700" } else { "500" };
            let text_y_first = row_top + font_size * 0.92;
            out.push_str(&format!(
                r##"  <g opacity="{:.3}" transform="translate({:.2}, 0)">
    <text x="58" y="{:.1}" text-anchor="end" fill="{}" font-family="Noto Sans Mono, Liberation Mono, monospace" font-size="{:.0}" font-weight="{}">{}</text>
"##,
                op, ltx, text_y_first, num_color, font_size, num_weight, idx + 1
            ));

            for (ri, row_text) in rows.iter().enumerate() {
                let ry = row_top + ri as f64 * line_h + font_size * 0.92;
                let trim = row_text.trim();
                if trim.starts_with("//") || trim.starts_with('#') {
                    out.push_str(&format!(
                        r##"    <text x="80" y="{:.1}" fill="#94A3B8" font-family="Noto Sans Mono, Liberation Mono, monospace" font-size="{:.0}" font-style="italic">{}</text>
"##,
                        ry, font_size, xml_escape(row_text)
                    ));
                } else {
                    out.push_str(&format!(
                        r##"    <text x="80" y="{:.1}" xml:space="preserve" font-family="Noto Sans Mono, Liberation Mono, monospace" font-size="{:.0}">"##,
                        ry, font_size
                    ));
                    // Emit colored spans per token
                    let mut pos = 0usize;
                    let emit_part = |part: &str, out: &mut String| {
                        if part.trim().is_empty() {
                            out.push_str(part);
                            return;
                        }
                        let clean = part.trim_matches(|c: char| ":,[]();".contains(c));
                        let (fill, bold) = if (part.starts_with('"') && part.ends_with('"'))
                            || (part.starts_with('\'') && part.ends_with('\''))
                        {
                            ("#34D399", false)
                        } else if kw.contains(clean) || kw.contains(part) {
                            ("#5EA8FF", true)
                        } else if part.chars().all(|c| c.is_ascii_digit() || c == ';') {
                            ("#F59E0B", false)
                        } else {
                            ("#F4EFE6", false)
                        };
                        if bold {
                            out.push_str(&format!(r#"<tspan fill="{}" font-weight="700">{}</tspan>"#, fill, xml_escape(part)));
                        } else {
                            out.push_str(&format!(r#"<tspan fill="{}">{}</tspan>"#, fill, xml_escape(part)));
                        }
                    };
                    for m in token_re.find_iter(row_text) {
                        if m.start() > pos {
                            emit_part(&row_text[pos..m.start()], &mut out);
                        }
                        emit_part(m.as_str(), &mut out);
                        pos = m.end();
                    }
                    if pos < row_text.len() {
                        emit_part(&row_text[pos..], &mut out);
                    }
                    out.push_str("</text>\n");
                }
            }
            out.push_str("  </g>\n");

            if let Some(ann) = shot.annotations.iter().find(|a| a.line == idx + 1) {
                let ann_f = (ann.at_ms / 1000.0 * fps).round();
                if local_frame as f64 >= ann_f {
                    let asp = remotion_spring(local_frame as f64 - ann_f, fps, 13.0, 210.0, 0.5);
                    if asp > 0.02 {
                        let aop = (asp * 1.4).min(1.0);
                        let atx = (1.0 - asp) * 18.0;
                        let badge_w = (ann.text.len() as f64 * 11.0 + 26.0).max(118.0);
                        let badge_x = 918.0 - badge_w;
                        let badge_y = row_top + row_block_h * 0.5 - 18.0;
                        out.push_str(&format!(
                            r##"  <g opacity="{:.3}" transform="translate({:.2}, 0)">
    <rect x="{:.1}" y="{:.1}" width="{:.1}" height="34" rx="4" fill="#128067" stroke="#34D399" stroke-width="2"/>
    <text x="{:.1}" y="{:.1}" text-anchor="middle" fill="#F4EFE6" font-family="Roboto, Liberation Sans, sans-serif" font-size="18" font-weight="700">{}</text>
  </g>
"##,
                            aop,
                            atx,
                            badge_x,
                            badge_y,
                            badge_w,
                            badge_x + badge_w * 0.5,
                            badge_y + 23.0,
                            xml_escape(&ann.text)
                        ));
                    }
                }
            }
            row_cursor += rows.len().max(1);
        }

        out.push_str("</g>\n");
        out
    }

    fn render_terminal_block(
        shot: &ShotItem,
        local_frame: u32,
        fps: f64,
        has_svg: bool,
    ) -> String {
        let cmds: &[CommandItem] = shot.terminal.as_deref().unwrap_or(&[]);
        let title = shot.headline.as_deref().unwrap_or("~/myapp");
        let compact = has_svg;
        let count = cmds.len().max(1);
        let cmd_fs: f64 = if compact {
            if count >= 3 { 22.0 } else { 27.0 }
        } else if count >= 3 {
            25.0
        } else {
            30.0
        };
        let out_fs: f64 = if compact {
            if count >= 3 { 20.0 } else { 24.0 }
        } else if count >= 3 {
            22.0
        } else {
            26.0
        };
        let pad_x = if compact { 26.0 } else { 30.0 };
        let pad_y = if compact { 20.0 } else { 28.0 };
        let header_h = if compact { 44.0 } else { 52.0 };
        let cmd_gap = if compact { 14.0 } else { 22.0 };

        let usable_frames = (shot.duration_in_frames as i32 - 12).max(36) as f64;
        let slot_frames = (usable_frames / count as f64).floor();

        let mut content_h = pad_y * 2.0;
        for (i, c) in cmds.iter().enumerate() {
            content_h += cmd_fs * 1.48;
            if c.output.is_some() {
                let lines = c.output.as_deref().unwrap_or("").split('\n').count();
                content_h += 6.0 + lines as f64 * (out_fs * 1.48);
            }
            if i + 1 < cmds.len() {
                content_h += cmd_gap;
            }
        }
        let box_h = header_h + content_h;
        let top_y = if has_svg { 125.0 } else { 180.0 + (1060.0 - box_h) * 0.5 };
        let enter = remotion_spring(local_frame as f64, fps, 14.0, 150.0, 0.75);
        let sc = 0.95 + 0.05 * enter;
        let cx = 470.0;
        let cy = box_h * 0.5;

        let mut out = format!(
            r##"<g transform="translate(70, {:.2}) translate({:.1}, {:.1}) scale({:.4}) translate({:.1}, {:.1})">
  <rect x="10" y="10" width="940" height="{:.1}" rx="6" fill="#090D12"/>
  <rect width="940" height="{:.1}" rx="6" fill="#171F2A" stroke="#2A3444" stroke-width="2"/>
  <path d="M 2 6 Q 2 2 6 2 H 934 Q 938 2 938 6 V {:.1} H 2 Z" fill="#1E2734"/>
  <line x1="2" y1="{:.1}" x2="938" y2="{:.1}" stroke="#2A3444" stroke-width="2"/>
  <text x="26" y="{:.1}" fill="#8E9BAE" font-family="Noto Sans Mono, Liberation Mono, monospace" font-size="18" font-weight="700">{}</text>
"##,
            top_y, cx, cy, sc, -cx, -cy,
            box_h, box_h, header_h, header_h, header_h, header_h * 0.64, xml_escape(title)
        );

        let lf = local_frame as f64;
        let mut cursor_y = header_h + pad_y;
        for (i, c) in cmds.iter().enumerate() {
            let cmd_cue = shot.cues.iter().find(|q| q.id == format!("cmd-{}", i + 1));
            let cmd_start = cmd_cue
                .map(|q| (q.at_ms / 1000.0 * fps).round())
                .unwrap_or(4.0 + i as f64 * slot_frames);
            let next_cue = shot.cues.iter().find(|q| q.id == format!("cmd-{}", i + 2));
            let max_window = next_cue
                .map(|q| ((q.at_ms / 1000.0 * fps).round() - cmd_start - 2.0).max(14.0))
                .unwrap_or(slot_frames);
            let type_dur = 8.0f64.max((max_window * 0.52).floor().min((c.cmd.chars().count() as f64 / 2.6).ceil()));
            let progress = interpolate(lf, cmd_start, cmd_start + type_dur, 0.0, c.cmd.chars().count() as f64, linear);
            let typed_chars = progress.floor() as usize;
            let visible_cmd: String = c.cmd.chars().take(typed_chars).collect();
            let is_cmd_vis = lf >= cmd_start;
            let out_cue = shot.cues.iter().find(|q| q.id == format!("out-{}", i + 1));
            let out_start = out_cue
                .map(|q| (q.at_ms / 1000.0 * fps).round())
                .unwrap_or(cmd_start + type_dur + 3.0);
            let show_out = lf >= out_start;
            let out_op = interpolate(lf, out_start, out_start + 4.0, 0.0, 1.0, linear);

            if is_cmd_vis {
                let cy_line = cursor_y + cmd_fs * 0.92;
                out.push_str(&format!(
                    r##"  <text x="{:.1}" y="{:.1}" fill="#5EA8FF" font-family="Noto Sans Mono, Liberation Mono, monospace" font-size="{:.0}" font-weight="700">$</text>
  <text x="{:.1}" y="{:.1}" fill="#E2DDD4" xml:space="preserve" font-family="Noto Sans Mono, Liberation Mono, monospace" font-size="{:.0}">"##,
                    pad_x, cy_line, cmd_fs, pad_x + 28.0, cy_line, cmd_fs
                ));
                for part in visible_cmd.split_inclusive(' ') {
                    let trimmed = part.trim_end();
                    let color = if trimmed == "redis-cli" || trimmed == "docker" || trimmed == "&&" {
                        Some(("#5EA8FF", true))
                    } else if matches!(trimmed, "SET" | "GET" | "INCR" | "ZADD" | "EX" | "build" | "run" | "ps" | "logs" | "stop" | "rm" | "compose" | "up") {
                        Some(("#F4EFE6", true))
                    } else if trimmed.starts_with('-') || trimmed.chars().all(|ch| ch.is_ascii_digit()) {
                        Some(("#F59E0B", false))
                    } else {
                        None
                    };
                    if let Some((col, bold)) = color {
                        if bold {
                            out.push_str(&format!(r#"<tspan fill="{}" font-weight="700">{}</tspan>"#, col, xml_escape(part)));
                        } else {
                            out.push_str(&format!(r#"<tspan fill="{}">{}</tspan>"#, col, xml_escape(part)));
                        }
                    } else {
                        out.push_str(&xml_escape(part));
                    }
                }
                out.push_str("</text>\n");

                if lf < out_start && local_frame % 10 < 5 {
                    let cursor_x = pad_x + 28.0 + visible_cmd.chars().count() as f64 * (cmd_fs * 0.602) + 4.0;
                    out.push_str(&format!(
                        r##"  <rect x="{:.1}" y="{:.1}" width="12" height="24" fill="#5EA8FF"/>
"##,
                        cursor_x, cursor_y + 4.0
                    ));
                }
            }
            cursor_y += cmd_fs * 1.48;

            if let Some(ref output) = c.output {
                if show_out {
                    let out_lines: Vec<&str> = output.split('\n').collect();
                    let oy_start = cursor_y + 6.0;
                    let oh = out_lines.len() as f64 * (out_fs * 1.48);
                    out.push_str(&format!(
                        r##"  <g opacity="{:.3}">
    <rect x="{:.1}" y="{:.1}" width="3" height="{:.1}" fill="#2A3444"/>
"##,
                        out_op, pad_x + 24.0, oy_start, oh
                    ));
                    for (li, ol) in out_lines.iter().enumerate() {
                        let lower = ol.to_lowercase();
                        let col = if lower.contains("err") || lower.contains("fail") {
                            "#F97352"
                        } else if lower.contains("ok") || lower.contains("hit") || lower.contains("ranked") || lower.contains("atomic") || lower.contains("up") {
                            "#34D399"
                        } else {
                            "#C7D0DC"
                        };
                        let oy = oy_start + li as f64 * (out_fs * 1.48) + out_fs * 0.92;
                        out.push_str(&format!(
                            r##"    <text x="{:.1}" y="{:.1}" fill="{}" font-family="Noto Sans Mono, Liberation Mono, monospace" font-size="{:.0}">{}</text>
"##,
                            pad_x + 38.0, oy, col, out_fs, xml_escape(ol)
                        ));
                    }
                    out.push_str("  </g>\n");
                    cursor_y += 6.0 + oh;
                } else {
                    let out_lines = output.split('\n').count();
                    cursor_y += 6.0 + out_lines as f64 * (out_fs * 1.48);
                }
            }
            cursor_y += cmd_gap;
        }
        out.push_str("</g>\n");
        out
    }

    pub fn build_caption_state_key(&self, props: &RemotionProps, frame: u32, fps: f64) -> (String, bool) {
        let idx = props
            .shots
            .iter()
            .position(|s| frame >= s.start_frame && frame < s.start_frame + s.duration_in_frames)
            .unwrap_or_else(|| props.shots.len().saturating_sub(1));
        let shot = &props.shots[idx];
        let is_ink = shot.recipe == "code" || shot.recipe == "terminal";
        let theme_tag = usize::from(is_ink);

        let time_ms = (frame as f64 / fps) * 1000.0;
        let Some((ci, chunk)) = self
            .chunks
            .iter()
            .enumerate()
            .find(|(_, c)| time_ms >= c.start_ms && time_ms < c.end_ms)
        else {
            return ("cap:empty".to_string(), true);
        };

        let chunk_enter_f = (chunk.start_ms / 1000.0) * fps;
        if (frame as f64 - chunk_enter_f) < 18.0 {
            return (format!("cap:t{}:c{}:f{}", theme_tag, ci, frame), false);
        }

        let mut spoken_mask = 0u32;
        let mut any_word_spring = false;
        for (wi, w) in chunk.words.iter().enumerate() {
            if time_ms >= w.start_ms && time_ms <= w.end_ms + 40.0 {
                spoken_mask |= 1u32 << (wi.min(31));
                let w_enter_f = (w.start_ms / 1000.0) * fps;
                if (frame as f64 - w_enter_f) < 18.0 {
                    any_word_spring = true;
                }
            }
        }
        if any_word_spring {
            return (format!("cap:t{}:c{}:f{}", theme_tag, ci, frame), false);
        }
        (format!("cap:t{}:c{}:m{}:s", theme_tag, ci, spoken_mask), true)
    }

    pub fn build_stage_state_key(&self, props: &RemotionProps, frame: u32, fps: f64) -> (String, bool) {
        let idx = props
            .shots
            .iter()
            .position(|s| frame >= s.start_frame && frame < s.start_frame + s.duration_in_frames)
            .unwrap_or_else(|| props.shots.len().saturating_sub(1));
        let shot = &props.shots[idx];
        let lf = frame.saturating_sub(shot.start_frame);
        let motion = shot.motion.as_deref().unwrap_or("pop");
        let trans = shot.transition_in.as_deref().unwrap_or("none");

        let mut cam_phase = 0u8;
        if shot.camera.len() > 1 {
            let mut sorted = shot.camera.clone();
            sorted.sort_by(|a, b| a.at_ms.total_cmp(&b.at_ms));
            let current_ms = (lf as f64 / fps) * 1000.0;
            let first_ms = sorted[0].at_ms;
            let last_ms = sorted[sorted.len() - 1].at_ms;
            if current_ms > first_ms && current_ms < last_ms {
                return (format!("s{}:cam:{}", idx, lf), false);
            }
            if current_ms >= last_ms {
                cam_phase = 1;
            }
        }

        if !matches!(trans, "slide-push" | "stamp-cut") && matches!(motion, "push-in" | "pull-out") {
            return (format!("s{}:cont:{}", idx, lf), false);
        }

        let mut windows: Vec<(u32, u32)> = Vec::new();
        if matches!(trans, "slide-push" | "stamp-cut") || matches!(motion, "pop" | "slide-up" | "slide-left") {
            windows.push((0, 28));
        }
        if trans == "ink-wipe" {
            windows.push((0, 9));
        }

        let mut has_blink = false;
        let mut extra_state = String::new();

        match shot.recipe.as_str() {
            "custom-svg" => {
                if let Some(ref prep) = self.prepared_svgs[idx] {
                    let cue_f = |id: &str, def_ms: f64| -> u32 {
                        shot.cues
                            .iter()
                            .find(|c| c.id == id)
                            .map(|c| (c.at_ms / 1000.0 * fps).round().max(0.0) as u32)
                            .unwrap_or_else(|| (def_ms / 1000.0 * fps).round().max(0.0) as u32)
                    };
                    for piece in &prep.pieces {
                        if let SvgPiece::AnimTag { attr_name, attr_val, .. } = piece {
                            if attr_name == "data-anim" {
                                match attr_val.as_str() {
                                    "disk-spin" | "arm-seek" | "flow" | "float" | "pulse" => {
                                        return (format!("s{}:cont:{}", idx, lf), false);
                                    }
                                    "led-blink" => has_blink = true,
                                    "pop" => windows.push((3, 30)),
                                    "pop-1" => windows.push((4, 31)),
                                    "pop-2" => windows.push((14, 41)),
                                    "pop-3" => windows.push((24, 51)),
                                    "pop-4" => windows.push((34, 61)),
                                    "pop-5" => windows.push((44, 71)),
                                    "slide-up" => windows.push((5, 34)),
                                    "slide-up-1" => windows.push((6, 35)),
                                    "slide-up-2" => windows.push((18, 47)),
                                    "slide-up-3" => windows.push((30, 59)),
                                    "slide-right" => windows.push((6, 35)),
                                    "drop" => windows.push((14, 48)),
                                    "arc-throw" => {
                                        let tf = cue_f("c-throw", 1600.0);
                                        windows.push((tf, tf + 19));
                                    }
                                    "plunger-press" => windows.push((0, 14)),
                                    "needle-slow" => {
                                        let sf = cue_f("c-slowbar", 800.0);
                                        windows.push((sf, sf + 27));
                                    }
                                    "needle-fast" => {
                                        let ff = cue_f("c-fastbar", 1500.0);
                                        windows.push((ff, ff + 28));
                                    }
                                    "flap-flip" => {
                                        let flf = cue_f("c-incr", 2400.0);
                                        windows.push((flf, flf + 10));
                                    }
                                    "draw" => windows.push((8, 37)),
                                    "shake" => windows.push((46, 74)),
                                    _ => {}
                                }
                            } else if let Some(cue) = shot.cues.iter().find(|c| c.id == *attr_val) {
                                let delay = ((cue.at_ms / 1000.0) * fps).round().max(0.0) as u32;
                                let dur = match attr_name.as_str() {
                                    "data-cue-drop" => 34,
                                    "data-cue-dim" => 7,
                                    "data-cue-draw" => 19,
                                    _ => 28,
                                };
                                windows.push((delay, delay + dur));
                            }
                        }
                    }
                }
            }
            "code" => {
                let dur_f = shot.duration_in_frames.max(1) as f64;
                let reveal_span = (dur_f * 0.2).floor().clamp(10.0, 24.0) as u32;
                windows.push((0, reveal_span + 28));
                let mut steps = shot.highlight_steps.clone();
                steps.sort_by(|a, b| a.at_ms.total_cmp(&b.at_ms));
                let mut active_idx: Option<usize> = None;
                for s in steps {
                    if (lf as f64) >= (s.at_ms / 1000.0 * fps).round() {
                        active_idx = Some(s.line.saturating_sub(1));
                    }
                }
                extra_state = format!("hl{:?}", active_idx);
                for ann in &shot.annotations {
                    let af = (ann.at_ms / 1000.0 * fps).round().max(0.0) as u32;
                    windows.push((af, af + 26));
                }
            }
            "terminal" => {
                let cmds: &[CommandItem] = shot.terminal.as_deref().unwrap_or(&[]);
                let count = cmds.len().max(1);
                let usable_frames = (shot.duration_in_frames as i32 - 12).max(36) as f64;
                let slot_frames = (usable_frames / count as f64).floor();
                let lf_f = lf as f64;
                let mut term_sig = String::new();
                let mut any_cursor = false;
                windows.push((0, 28));
                for (ci, c) in cmds.iter().enumerate() {
                    let cmd_cue = shot.cues.iter().find(|q| q.id == format!("cmd-{}", ci + 1));
                    let cmd_start = cmd_cue
                        .map(|q| (q.at_ms / 1000.0 * fps).round())
                        .unwrap_or(4.0 + ci as f64 * slot_frames);
                    let next_cue = shot.cues.iter().find(|q| q.id == format!("cmd-{}", ci + 2));
                    let max_window = next_cue
                        .map(|q| ((q.at_ms / 1000.0 * fps).round() - cmd_start - 2.0).max(14.0))
                        .unwrap_or(slot_frames);
                    let type_dur = 8.0f64.max((max_window * 0.52).floor().min((c.cmd.chars().count() as f64 / 2.6).ceil()));
                    let out_cue = shot.cues.iter().find(|q| q.id == format!("out-{}", ci + 1));
                    let out_start = out_cue
                        .map(|q| (q.at_ms / 1000.0 * fps).round())
                        .unwrap_or(cmd_start + type_dur + 3.0);

                    let cs_u = cmd_start.max(0.0) as u32;
                    let type_end_u = (cmd_start + type_dur).ceil().max(0.0) as u32 + 1;
                    let os_u = out_start.max(0.0) as u32;
                    windows.push((cs_u, type_end_u));
                    windows.push((os_u, os_u + 5));
                    if lf_f >= cmd_start && lf_f < out_start {
                        any_cursor = true;
                    }
                    if c.output.is_some() && lf_f >= out_start {
                        term_sig.push('o');
                    } else if lf_f >= cmd_start {
                        term_sig.push('c');
                    } else {
                        term_sig.push('_');
                    }
                }
                let cursor_blink = if any_cursor && lf % 10 < 5 { 1 } else { 0 };
                extra_state = format!("t:{}:{}", term_sig, cursor_blink);
            }
            _ => {
                let headline = shot.headline.as_deref().unwrap_or(&props.title);
                let words_cnt = headline.split_whitespace().count() as u32;
                windows.push((0, 28 + words_cnt * 3 + 2));
            }
        }

        if windows.iter().any(|&(s, e)| lf >= s && lf < e) {
            return (format!("s{}:lf{}", idx, lf), false);
        }
        let started = windows.iter().filter(|&&(s, _)| lf >= s).count();
        let finished = windows.iter().filter(|&&(_, e)| lf >= e).count();
        let blink = if has_blink { usize::from(lf % 18 < 10) } else { 2 };
        (format!("s{}:st:{}:{}:{}:{}:{}", idx, started, finished, cam_phase, blink, extra_state), true)
    }

    pub fn render_stage_svg(&self, props: &RemotionProps, frame: u32, fps: f64) -> (bool, String) {
        let idx = props
            .shots
            .iter()
            .position(|s| frame >= s.start_frame && frame < s.start_frame + s.duration_in_frames)
            .unwrap_or_else(|| props.shots.len().saturating_sub(1));
        let shot = &props.shots[idx];
        let is_ink = shot.recipe == "code" || shot.recipe == "terminal";
        let lf = frame.saturating_sub(shot.start_frame);
        let lf_f = lf as f64;
        let accent = props.accent_color.as_deref().unwrap_or("#1D63ED");

        // ShotStage spring & camera (subtle critically-damped entrance matching Remotion)
        let enter_sp = remotion_spring(lf_f, fps, 20.0, 180.0, 0.6);
        let mut stage_tx = 0.0f64;
        let mut stage_ty = 0.0f64;
        let mut stage_sc = 1.0f64;
        let trans = shot.transition_in.as_deref().unwrap_or("none");
        if trans == "slide-push" {
            stage_tx = 56.0 * (1.0 - enter_sp);
        } else if trans == "stamp-cut" {
            stage_sc = 1.04 + (1.0 - 1.04) * enter_sp;
        } else {
            match shot.motion.as_deref().unwrap_or("pop") {
                "pop" => stage_sc = 0.96 + 0.04 * enter_sp,
                "slide-up" => stage_ty = 32.0 * (1.0 - enter_sp),
                "slide-left" => stage_tx = 40.0 * (1.0 - enter_sp),
                "push-in" => stage_sc = interpolate(lf_f, 0.0, shot.duration_in_frames.max(1) as f64, 1.0, 1.045, linear),
                "pull-out" => stage_sc = interpolate(lf_f, 0.0, shot.duration_in_frames.max(1) as f64, 1.05, 1.0, linear),
                _ => {}
            }
        }
        let (cam_x, cam_y, cam_sc) = interpolate_camera(&shot.camera, lf, fps);
        let total_tx = stage_tx + cam_x;
        let total_ty = stage_ty + cam_y;
        let total_sc = stage_sc * cam_sc;

        let mut svg = String::with_capacity(16384);
        svg.push_str(r#"<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">"#);
        svg.push_str(&format!(
            r#"<g transform="translate(540.0, 806.4) scale({:.4}) translate(-540.0, -806.4) translate({:.2}, {:.2})">"#,
            total_sc, total_tx, total_ty
        ));

        let has_svg = self.prepared_svgs[idx].is_some();
        match shot.recipe.as_str() {
            "custom-svg" => {
                if let Some(ref prep) = self.prepared_svgs[idx] {
                    svg.push_str(&render_prepared_svg(prep, shot, lf, fps, 50.0, 130.0, 980.0, 1120.0));
                }
            }
            "code" => {
                svg.push_str(&Self::render_code_block(
                    shot,
                    lf,
                    fps,
                    has_svg,
                    props.subtitle.as_deref().unwrap_or("// empty"),
                ));
                if let Some(ref prep) = self.prepared_svgs[idx] {
                    svg.push_str(&render_prepared_svg(prep, shot, lf, fps, 50.0, 705.0, 980.0, 540.0));
                }
            }
            "terminal" => {
                svg.push_str(&Self::render_terminal_block(shot, lf, fps, has_svg));
                if let Some(ref prep) = self.prepared_svgs[idx] {
                    svg.push_str(&render_prepared_svg(prep, shot, lf, fps, 50.0, 695.0, 980.0, 540.0));
                }
            }
            _ => {
                let is_stat = shot.recipe == "stat-callout";
                let top_y = if is_stat { 220.0 } else { 230.0 };
                let fs: f64 = if is_stat { 76.0 } else { 84.0 };
                let bar_w = if is_stat { 96.0 } else { 110.0 };
                let bar_col = if is_stat { "#D94426" } else { accent };
                let headline = shot.headline.as_deref().unwrap_or(&props.title);
                let words_h: Vec<&str> = headline.split_whitespace().collect();
                let mut cur_y = top_y + 180.0;
                svg.push_str(&format!(r##"<rect x="90" y="{:.1}" width="{:.1}" height="10" fill="{}"/>"##, cur_y - 95.0, bar_w, bar_col));
                let mut line_x = 90.0f64;
                for (wi, w) in words_h.iter().enumerate() {
                    let ww = self.measure_display_word(w, fs);
                    if line_x > 90.0 && line_x + ww > 990.0 {
                        line_x = 90.0;
                        cur_y += fs * 1.12;
                    }
                    let wp = remotion_spring(lf_f - wi as f64 * 3.0, fps, 13.0, 160.0, 0.6);
                    let wop = wp.clamp(0.0, 1.0);
                    let wty = (1.0 - wp) * 26.0;
                    let norm_w: String = w.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_lowercase();
                    let is_hl = shot.emphasis.iter().any(|e| {
                        e.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_lowercase() == norm_w
                    });
                    let col = if is_hl { accent } else { "#121820" };
                    svg.push_str(&format!(
                        r##"<text x="{:.1}" y="{:.1}" fill="{}" opacity="{:.3}" transform="translate(0, {:.2})" font-family="Outfit, Liberation Sans, sans-serif" font-size="{:.0}" font-weight="900">{}</text>"##,
                        line_x, cur_y, col, wop, wty, fs, xml_escape(w)
                    ));
                    line_x += ww + 20.0;
                }
                if let Some(ref body_txt) = shot.body {
                    let sep_y = cur_y + 42.0;
                    svg.push_str(&format!(r##"<line x1="90" y1="{:.1}" x2="990" y2="{:.1}" stroke="#121820" stroke-width="3"/>"##, sep_y, sep_y));
                    if is_stat {
                        for (pi, part) in body_txt.split('|').enumerate() {
                            let py = sep_y + 48.0 + pi as f64 * 46.0;
                            svg.push_str(&format!(
                                r##"<rect x="90" y="{:.1}" width="12" height="12" fill="{}"/><text x="118" y="{:.1}" fill="#344050" font-family="Roboto, Liberation Sans, sans-serif" font-size="30" font-weight="700">{}</text>"##,
                                py - 18.0, accent, py, xml_escape(part.trim())
                            ));
                        }
                    } else {
                        svg.push_str(&format!(
                            r##"<text x="90" y="{:.1}" fill="#5B6572" font-family="Noto Sans Mono, Liberation Mono, monospace" font-size="28" font-weight="700">{}</text>"##,
                            sep_y + 52.0, xml_escape(body_txt)
                        ));
                    }
                }
            }
        }
        svg.push_str("</g>");

        // Ink-wipe bars on frames 0..8
        if trans == "ink-wipe" && lf < 9 {
            let wipe_x = interpolate(lf_f, 0.0, 8.0, -1150.0, 1180.0, easing_in_out_cubic);
            svg.push_str(&format!(
                r##"<g transform="translate({:.1}, 0)"><rect x="0" y="0" width="160" height="1920" fill="#1D63ED"/><rect x="160" y="0" width="920" height="1920" fill="#121820"/></g>"##,
                wipe_x
            ));
        }

        svg.push_str("</svg>");
        (is_ink, svg)
    }

    pub fn rasterize_stage_bgr24_into(&self, props: &RemotionProps, frame: u32, fps: f64, dst_bgr: &mut [u8]) {
        let (is_ink, stage_svg) = self.render_stage_svg(props, frame, fps);
        let bg_bytes = self.background_for(is_ink);
        STAGE_PIXMAP.with(|cell| {
            let mut slot = cell.borrow_mut();
            let pixmap = slot.get_or_insert_with(|| Pixmap::new(WIDTH, HEIGHT).unwrap());
            pixmap.data_mut().copy_from_slice(bg_bytes);
            if let Ok(tree) = usvg::Tree::from_str(&stage_svg, &self.base_opt) {
                resvg::render(&tree, usvg::Transform::identity(), &mut pixmap.as_mut());
            }
            for (px, dst) in pixmap.data().chunks_exact(4).zip(dst_bgr.chunks_exact_mut(3)) {
                dst[0] = px[2];
                dst[1] = px[1];
                dst[2] = px[0];
            }
        });
    }

    pub fn rasterize_caption_rgba_into(&self, props: &RemotionProps, frame: u32, fps: f64, dst_rgba: &mut [u8]) -> bool {
        let time_ms = (frame as f64 / fps) * 1000.0;
        let Some(chunk) = self.chunks.iter().find(|c| time_ms >= c.start_ms && time_ms < c.end_ms) else {
            return false;
        };
        let idx = props
            .shots
            .iter()
            .position(|s| frame >= s.start_frame && frame < s.start_frame + s.duration_in_frames)
            .unwrap_or_else(|| props.shots.len().saturating_sub(1));
        let shot = &props.shots[idx];
        let is_ink = shot.recipe == "code" || shot.recipe == "terminal";

        dst_rgba.fill(0);
        let mut pixmap = PixmapMut::from_bytes(dst_rgba, WIDTH, CAP_H).unwrap();
        let chunk_enter_f = (chunk.start_ms / 1000.0) * fps;
        let pop = remotion_spring((frame as f64 - chunk_enter_f).max(0.0), fps, 14.0, 200.0, 0.5);
        let ty = (1.0 - pop) * 10.0;

        let font_size = 52.0f64;
        let gap = 24.0f64;
        let mut lines: Vec<Vec<(usize, &str, f64)>> = Vec::new();
        let mut cur_line: Vec<(usize, &str, f64)> = Vec::new();
        let mut cur_w = 0.0f64;
        for (wi, w) in chunk.words.iter().enumerate() {
            let ww = self.measure_display_word(&w.word, font_size);
            let add_w = ww + if cur_line.is_empty() { 0.0 } else { gap };
            if !cur_line.is_empty() && cur_w + add_w > 870.0 {
                lines.push(std::mem::take(&mut cur_line));
                cur_w = ww;
                cur_line.push((wi, &w.word, ww));
            } else {
                cur_w += add_w;
                cur_line.push((wi, &w.word, ww));
            }
        }
        if !cur_line.is_empty() {
            lines.push(cur_line);
        }

        let paint_exact = PixmapPaint {
            opacity: 1.0,
            blend_mode: BlendMode::SourceOver,
            quality: FilterQuality::Nearest,
        };
        let paint_scaled = PixmapPaint {
            opacity: 1.0,
            blend_mode: BlendMode::SourceOver,
            quality: FilterQuality::Bilinear,
        };

        for (li, row) in lines.iter().enumerate() {
            let row_w: f64 = row.iter().map(|w| w.2).sum::<f64>() + gap * row.len().saturating_sub(1) as f64;
            let mut x = 540.0 - row_w * 0.5;
            let y = 1350.0 + font_size * 0.95 + li as f64 * (font_size * 1.24);
            for (wi, _word_str, ww) in row {
                let w = &chunk.words[*wi];
                let is_spoken = time_ms >= w.start_ms && time_ms <= w.end_ms + 40.0;
                let sc = if is_spoken {
                    let wp = remotion_spring((frame as f64 - (w.start_ms / 1000.0) * fps).max(0.0), fps, 12.0, 220.0, 0.4);
                    1.0 + wp * 0.07
                } else {
                    1.0
                };
                let dst_cx = x + ww * 0.5;
                let dst_cy = (y - font_size * 0.35) + ty - CAP_Y as f64;
                if let Some(sprite) = self.word_sprites.get(&(w.word.clone(), is_ink, is_spoken)) {
                    let src_cx = sprite.pixmap.width() as f64 * 0.5;
                    let src_cy = 56.0f64;
                    let xform = Transform::from_row(
                        sc as f32,
                        0.0,
                        0.0,
                        sc as f32,
                        (dst_cx - src_cx * sc) as f32,
                        (dst_cy - src_cy * sc) as f32,
                    );
                    let paint = if (sc - 1.0).abs() < 1e-4 && ty.abs() < 1e-2 {
                        &paint_exact
                    } else {
                        &paint_scaled
                    };
                    pixmap.draw_pixmap(0, 0, sprite.pixmap.as_ref(), paint, xform, None);
                }
                x += ww + gap;
            }
        }
        true
    }

    pub fn rasterize_frame(&self, props: &RemotionProps, frame: u32, fps: f64) -> Vec<u8> {
        let (is_ink, stage_svg) = self.render_stage_svg(props, frame, fps);
        let bg_bytes = self.background_for(is_ink);
        let mut pixmap = Pixmap::new(WIDTH, HEIGHT).unwrap();
        pixmap.data_mut().copy_from_slice(bg_bytes);

        if let Ok(tree) = usvg::Tree::from_str(&stage_svg, &self.base_opt) {
            resvg::render(&tree, usvg::Transform::identity(), &mut pixmap.as_mut());
        }
        let mut cap_rgba = vec![0u8; (WIDTH as usize) * (CAP_H as usize) * 4];
        if self.rasterize_caption_rgba_into(props, frame, fps, &mut cap_rgba) {
            composite_caption_onto_pixmap(&mut pixmap, &cap_rgba);
        }
        pixmap.take()
    }
}
