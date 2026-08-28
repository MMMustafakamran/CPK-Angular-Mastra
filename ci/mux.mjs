/**
 * Mux the voiceover tracks onto the clips already in `autorecorder/videos/`.
 *
 * `ci/automate.mjs` runs this same step at the end of a full pipeline run, so
 * CI needs nothing extra. This entry point exists for the other half of the
 * loop: `npm run record -- --shared-state` in autorecorder/ writes a silent
 * clip, and re-running the whole automation just to hear it is wasteful. It is
 * a thin wrapper on purpose — the mapping and the ffmpeg call live in
 * `ci/lib/mux.mjs` and stay single-sourced.
 *
 * Re-running it re-muxes: the audio is applied to the video as it is on disk,
 * so a clip that already has a track gains a second one. Re-record the clip
 * before muxing again.
 */
import { muxAudioFiles } from './lib/mux.mjs';

muxAudioFiles();
