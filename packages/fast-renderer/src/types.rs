use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordTiming {
    pub word: String,
    pub start_ms: f64,
    pub end_ms: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct BeatTiming {
    pub beat_id: String,
    pub start_ms: f64,
    pub end_ms: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandItem {
    pub cmd: String,
    pub output: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightStep {
    pub line: usize,
    pub at_ms: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeAnnotation {
    pub line: usize,
    pub text: String,
    pub at_ms: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct SvgCue {
    pub id: String,
    pub at_ms: f64,
    pub sfx: Option<String>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraKeyframe {
    pub at_ms: f64,
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ShotItem {
    pub id: String,
    pub start_frame: u32,
    pub duration_in_frames: u32,
    pub recipe: String,
    pub headline: Option<String>,
    pub body: Option<String>,
    pub code: Option<String>,
    pub terminal: Option<Vec<CommandItem>>,
    pub svg: Option<String>,
    pub motion: Option<String>,
    #[serde(default)]
    pub emphasis: Vec<String>,
    #[serde(default)]
    pub highlight_steps: Vec<HighlightStep>,
    #[serde(default)]
    pub cues: Vec<SvgCue>,
    #[serde(default)]
    pub camera: Vec<CameraKeyframe>,
    pub transition_in: Option<String>,
    #[serde(default)]
    pub annotations: Vec<CodeAnnotation>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotionProps {
    pub title: String,
    pub subtitle: Option<String>,
    pub accent_color: Option<String>,
    pub audio_src: Option<String>,
    #[serde(default)]
    pub words: Vec<WordTiming>,
    #[serde(default)]
    pub beats: Vec<BeatTiming>,
    #[serde(default)]
    pub shots: Vec<ShotItem>,
}
