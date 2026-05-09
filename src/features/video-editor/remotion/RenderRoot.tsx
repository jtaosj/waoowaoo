import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { VideoComposition, type VideoCompositionProps } from './VideoComposition'
import { VIDEO_EDITOR_COMPOSITION_ID } from './constants'

const defaultProps: VideoCompositionProps = {
  clips: [],
  bgmTrack: [],
  config: {
    fps: 24,
    width: 1920,
    height: 1080,
  },
}

function RemotionRoot() {
  return (
    <Composition
      id={VIDEO_EDITOR_COMPOSITION_ID}
      component={VideoComposition}
      durationInFrames={1}
      fps={24}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
    />
  )
}

registerRoot(RemotionRoot)
