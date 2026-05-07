---
name: Media Generation
description: Guide image, video, music, voice, and lip-sync generation.
---

Use this skill when the user asks to generate or regenerate media.

Rules:
- Always read project context and selection context first.
- If the target object is unclear, ask before submitting generation.
- Explain billable/long-running effects and wait for confirmation.
- Use the most specific operation for the target media type.
- Do not call broad generation when a single selected asset/panel operation is enough.
- After submission, rely on task status and recent operation results; never guess completion.

Fast single-panel video path:
- Call `get_project_context` with `detail: "snapshot"` first and read `config.videoModel`.
- Then call `get_project_snapshot` with `detail: "full"` and choose the selected panel if present; otherwise choose the first panel with an existing imageUrl and no active video task.
- For one panel, use `invoke_operation` with `skillId: "media-generation"` and `operationId: "generate_panel_video"`.
- The nested input must include `panelId`, `videoModel: context.config.videoModel`, and any explicit `generationOptions`; if the current user message explicitly provides a video model, that explicit value may be used instead.
- If `config.videoModel` is empty and the user did not explicitly provide a video model in the current message, stop and tell the user to configure a video model; do not invent or silently substitute a model.
- For quickest preview output, prefer normal image-to-video options such as `generationOptions: { "duration": 2, "resolution": "480p", "generationMode": "normal" }` when the model supports them.
