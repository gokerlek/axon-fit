# Local pose assets

Pose Landmarker Lite float16 v1, downloaded from Google's official model distribution:
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task

SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`

Runtime: pinned `@mediapipe/tasks-vision@1.0.1` (Apache-2.0). `npm ci`, `npm run dev` and `npm run build` prepare its classic JS and SIMD/non-SIMD WASM files locally, plus the worker generated from `src/lib/pose/pose-worker.ts`. Generated runtime files are ignored by Git. No runtime CDN fetch is required. The model is checked into this repository so fresh installations need no separate model download.

Images are transient transferable ImageBitmaps in a dedicated worker; each bitmap closes after inference. Only normalized x/y/visibility landmarks return to the UI. No images, segmentation masks or world landmarks are uploaded or persisted. Workers terminate on camera stop, hidden page and unmount. Angles are descriptive 2D projections in source pixel coordinates, not clinical thresholds or validated motion scores.
