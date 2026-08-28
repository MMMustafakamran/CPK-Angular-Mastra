/**
 * Voiceover muxing — the only implementation.
 *
 * In the React repos this existed twice: once here (run per shard) and again in
 * the workflow's consolidate job, so a shard's audio got muxed and consolidate
 * muxed the same track onto the already-muxed file. Muxing happens once, where
 * the video is produced; the workflow just installs ffmpeg and lets this run.
 *
 * Two pages carry a voiceover: Shared State and Threads. The tracks live in
 * `autorecorder/audio/` and are shared verbatim by all three Angular repos —
 * the narration is about the CopilotKit concept, not the agent framework behind
 * it, so the same recording fits AGNO-, MASTRA- and MSPY-angular. Every other
 * clip stays silent and is skipped by the table below.
 *
 * WebM cannot carry AAC — audio is re-encoded to libopus. Missing ffmpeg is a
 * skip, not a failure: a silent demo still beats no demo.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_DIR, VIDEOS_DIR } from './config.mjs';

/**
 * Which audio track belongs to which video. `videoMatch` is matched against the
 * video filename, which carries the demo name
 * (e.g. `MASTRA-angular-08-Threads.webm`).
 *
 * The mapping is explicit rather than inferred from filenames, so a renamed
 * demo drops its voiceover visibly instead of quietly muxing it onto the wrong
 * clip. Both matches are unique across this repo's `videoName`s.
 *
 * @type {{ audioFile: string, videoMatch: string }[]}
 */
const AUDIO_TRACKS = [
  {
    audioFile: 'sharedstate-angular.m4a',
    videoMatch: 'SharedState',
  },
  {
    audioFile: 'thread-angular.m4a',
    videoMatch: 'Threads',
  },
];

function hasFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function muxAudioFiles() {
  if (AUDIO_TRACKS.length === 0) return;
  const tracks = AUDIO_TRACKS.filter((t) => fs.existsSync(path.join(AUDIO_DIR, t.audioFile)));
  if (tracks.length === 0) return;
  if (!fs.existsSync(VIDEOS_DIR)) return;

  if (!hasFfmpeg()) {
    console.log('ℹ️ [Audio Mux] ffmpeg not found in PATH; skipping (videos stay silent).');
    return;
  }

  const files = fs.readdirSync(VIDEOS_DIR);

  for (const track of tracks) {
    const audioPath = path.join(AUDIO_DIR, track.audioFile);
    const video = files.find(
      (f) => f.includes(track.videoMatch) && f.endsWith('.webm') && !f.startsWith('temp_'),
    );

    if (!video) {
      console.log(
        `ℹ️ [Audio Mux] No ${track.videoMatch} video in this run; skipping ${track.audioFile}.`,
      );
      continue;
    }

    const inputPath = path.join(VIDEOS_DIR, video);
    const tempPath = path.join(VIDEOS_DIR, `temp_${video}`);
    console.log(`\n🎵 [Audio Mux] Adding ${track.audioFile} to ${video}...`);

    try {
      // `-af apad` + `-shortest` together pin the output to the VIDEO's length.
      // `-shortest` alone would truncate: these narrations are shorter than the
      // clips they describe (45s of audio over a 72s Shared State demo), so the
      // bare flag cut the demo off mid-scene. apad pads the track with silence
      // and -shortest then stops at the video, which also keeps a track that
      // overruns from extending the clip past its last frame.
      execSync(
        `ffmpeg -y -i "${inputPath}" -i "${audioPath}" -c:v copy -c:a libopus -af apad -map 0:v:0 -map 1:a:0 -shortest "${tempPath}"`,
        { stdio: 'ignore' },
      );
      fs.copyFileSync(tempPath, inputPath);
      fs.unlinkSync(tempPath);
      console.log(`✅ [Audio Mux] Added audio to ${video}`);
    } catch (err) {
      console.warn(`⚠️ [Audio Mux] Could not mux ${track.audioFile}:`, err.message || err);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
}
