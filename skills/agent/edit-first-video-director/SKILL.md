---
name: Edit-First Video Director
description: Plan short-drama generation around an EditTimeline before media work starts.
---

Use this skill when the user asks for edit-first short-drama or video direction, timeline planning, segment-first multi-agent production, shot-level repair, or a PlanRun-ready generation draft.

Core contract:
- Plain natural language is the expected input. The user may only write a story, a loose film idea, or "make this into a video"; never require them to name agents, tools, operations, blackboards, or the edit-first architecture.
- For creative, production, video, or story entry points, force this segment-first subagent workflow by default. If the story is missing, ask for the story or use project context; do not switch to a legacy fixed chain.
- Treat `EditTimelineBlackboard` as the runtime source of truth and `EditTimeline` as the editable timing surface derived from it.
- The flow is story -> Main Director dynamic Macro Script -> per-segment Segment Blackboard -> specialist agent contributions -> blackboard image/video prompt packages -> production bridge -> PlanRun -> provider panel videos -> final.video.
- Main Director must decide segment count, timing, beat goals, and dependencies from the user's actual story. Never reuse a fixed convenience-store, fixed-second, or fixed-shot template unless the user explicitly wrote that story.
- v1 uses one generatable shot per segment by default, but each segment still owns its own blackboard and agent states so later versions can expand a segment into multiple shots.
- Direct like a filmmaker, not a generic text-to-video splitter:
  - Each shot must express exactly one core visible action tied to the segment beat goal.
  - The subject must be readable in the opening frame and stay visible through the action.
  - Camera movement should be restrained and motivated by the story beat; avoid busy motion that hides the action.
  - Every segment must move emotion or narrative state forward, not merely describe atmosphere.
  - The final shot must serve the payoff and end on a stable frame that can become `final.video` evidence.
- Validate timeline structure and references before compiling anything.
- Compile only from the blackboard prompt packages. For real generation, call the production bridge so it can materialize the exact blackboard prompts into panels and start the PlanRun with auditable provider tasks.
- Stop when references are unresolved. Report the missing refs and the affected shots.
- Open-source film-agent learning is part of continuous improvement. Treat external systems as reference patterns only: borrow concrete ideas such as reference-first continuity, auditable provider decisions, pipeline manifests, stage skills, self-review, and memory summaries; adapt them into this product's blackboard/tests instead of copying their architecture wholesale.

Allowed path:
1. Use `create_edit_timeline_plan` to create a draft timeline from the user goal and available project context.
   - Pass the user's story in `goal` exactly; do not use routing instructions as the story.
   - When the user states duration, aspect ratio, shot count, style, audio, or subtitle constraints, pass them as structured fields: `duration` in seconds, `targetDurationMs` when already known in milliseconds, `aspectRatio`, `shotCount`, `style`, `hasAudio`, and `hasSubtitle`.
   - The returned `blackboard.macroScript` is the Main Director's dynamic time split.
   - The returned `blackboard.segmentBlackboards` are the per-segment collaboration boards for Screenplay, Cinematography, Continuity, Prompt Engineer, Sound, Provider Production, and Film Critic.
   - The returned legacy `agentCrew` is UI compatibility only; do not treat it as the source of truth.
2. Explain the visible plan using the blackboard: Macro Script time ranges, segment goals, dependencies, agent contribution status, prompt packages, provider policy, blockers, and Film Critic score.
3. Use `validate_edit_timeline` to return explicit timeline and reference issues.
4. Use `compile_edit_timeline` only after validation is clean when the user needs to review a draft before execution.
   - Always pass the exact `blackboard` returned by `create_edit_timeline_plan` into `compile_edit_timeline`. If the blackboard is missing or does not cover every segment/shot, stop and report that blocker instead of compiling timeline-only.
   - For approved real video generation, pass explicit `videoModel` plus either `panelIdsByShotId` or `storyboardId` + `startPanelIndex` into `compile_edit_timeline`. This still only prepares the PlanRun draft; execution belongs to the next confirmed `execute_plan` step.
5. Use `start_edit_timeline_production_run` when the user has approved real generation or when the UI asks to generate from an edit-first plan.
   - Always pass the exact `timeline` and `blackboard` returned by `create_edit_timeline_plan`.
   - The operation must write each shot's `promptPackage.imagePrompt` and `promptPackage.providerPrompt` into storyboard panels before submitting provider video tasks.
   - If `videoModel` is not explicit, it may use the configured project/user video model; if no configured video model exists, report `EDIT_TIMELINE_VIDEO_MODEL_NOT_CONFIGURED`.
   - Do not treat a planned storyboard, panel, or PlanRun as a final video. Provider task ids, panel video URLs, and final.video evidence must come from runtime evidence.
6. Use `score_edit_timeline_trace` only when there are persisted PlanRun trace ids to grade.
7. Use `redo_timeline_shot` only for a targeted failed shot; report affected downstream shots instead of rebuilding the whole timeline.

Boundaries:
- Do not call `generate_panel_video`, `generate_episode_videos`, image generation, voice generation, music generation, or lip-sync operations directly. Real video generation must go through `start_edit_timeline_production_run` or a reviewed PlanRun path that preserves blackboard evidence.
- Do not invent missing first-frame, last-frame, character, location, or style assets.
- Do not hide validation failures with default assets, provider guesses, or silent model changes.
- Sound Agent output is a nonblocking plan in v1. Silent video generation must not wait on sound, subtitles, music, lip-sync, or voice.

Continuous learning loop:
- When improving the skill, compare one open-source film/video agent pattern per round and turn it into exactly one local change plus one test or one browser evidence check.
- Current useful patterns: ArcReel-style reference sheets before shots for continuity; OpenMontage-style auditable pipeline/provider decisions and self-review; Codeywood-style reusable workflows with error-handling checkpoints; FilmAgent-style role collaboration with intermediate revision; UniVA-style plan-and-act separation with task/user memory.
- Record the source, adopted idea, changed prompt/skill/code, evidence, and remaining risk in the automation evidence folder and context index.
