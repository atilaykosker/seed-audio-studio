const VIDEOS = [
  {
    title: 'The Speckled Band',
    source: 'Sherlock Holmes — Arthur Conan Doyle',
    cast: 'Watson · Holmes · Helen · Roylott',
    src: 'https://v3b.fal.media/files/b/0aa04213/51XyG69HKxp8T22d8SHax_sherlock.mp4',
  },
  {
    title: 'Down the Rabbit-Hole',
    source: 'Alice in Wonderland — Lewis Carroll',
    cast: 'Narrator · Alice · White Rabbit',
    src: 'https://v3b.fal.media/files/b/0aa0425a/4eMfqDpBhUv4oRnMZ0kac_alice.mp4',
  },
  {
    title: "Marley's Ghost",
    source: 'A Christmas Carol — Charles Dickens',
    cast: 'Narrator · Scrooge · Marley',
    src: 'https://v3b.fal.media/files/b/0aa0425b/-Tjhl9DrNg-mZW-1uKOZu_carol.mp4',
  },
]

export function Examples() {
  return (
    <section id="examples" className="mx-auto max-w-5xl px-5 py-12 border-t border-border/40 scroll-mt-16">
      <h2 className="text-2xl font-semibold text-center">Examples — public-domain books, full-cast</h2>
      <p className="text-center text-muted-foreground mt-2 text-sm">
        Each one made from a chapter: a distinct voice per character, sound effects, and word-synced captions.
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {VIDEOS.map((v) => (
          <figure key={v.title} className="rounded-xl border border-border/60 overflow-hidden bg-card">
            <video
              controls
              preload="metadata"
              playsInline
              src={v.src}
              className="w-full aspect-video bg-black"
            />
            <figcaption className="p-4">
              <h3 className="font-medium leading-tight">{v.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{v.source}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">🎙 {v.cast}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
