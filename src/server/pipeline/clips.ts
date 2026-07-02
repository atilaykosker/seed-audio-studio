import type { Plan, BiographyPlan, Clip } from '../../lib/types'

let counter = 0
function uid(): string {
  counter += 1
  return `clip_${counter}_${counter * 2654435761 % 2 ** 31}`
}

export function planToClips(plan: Plan): Clip[] {
  return plan.scenes.map((scene) => ({
    id: uid(),
    sceneId: scene.id,
    title: scene.title,
    speakers: scene.speakers,
    prompt: `${scene.visual}\n${scene.dialogue}`,
    status: 'pending' as const,
  }))
}

export function bioPlanToClips(bioPlan: BiographyPlan): Clip[] {
  const clips: Clip[] = []
  for (const page of bioPlan.pages) {
    page.shots.forEach((shot, i) => {
      clips.push({
        id: uid(),
        sceneId: shot.id,
        title: `Page ${page.index} · Shot ${i + 1}`,
        speakers: [],
        prompt: shot.visual,
        status: 'pending',
      })
    })
  }
  return clips
}
