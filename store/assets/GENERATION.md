# Artwork generation notes

The icon direction was explored with the built-in image-generation tool using this prompt:

> Use case: logo-brand. Asset type: Chrome extension app icon redraw. Treat the existing icon only as the concept to refine: two people/listeners arranged around a central audio pulse. Redraw it as a polished, flat geometric logo. Use a dark espresso circular field, one solid coral-red upper arc ending in a round listener dot, one solid amber-yellow lower arc ending in a round listener dot, and exactly three warm-cream vertical waveform bars. Use smooth intentional geometry, consistent widths, even spacing, crisp hard edges, and a strong 16-pixel silhouette. Use only #24120F, #FF5F3A, #FFB000, and #FFF3E6. Remove every glow, gradient, highlight, shadow, blur, texture, outline, fuzzy edge, and cream swoosh. Use real transparency outside the mark. No text, mockup, background, play button, or competitor-style speech-bubble/music-note mark.

Image generation established the simplified composition, but the final source was rebuilt as exact SVG geometry to remove generated gradients, fake transparency, and irregular edges. The production source is `icon-source-v3.svg`; `scripts/build-store-icon.mjs` rasterizes it directly at every required icon size. The promotional tile and screenshots are composed deterministically by `scripts/capture-store-screenshots.mjs` from that mark and real captures of the built extension side panel.

The screenshot copy follows an original TogetherTune campaign:

- Pass the aux without passing a thing.
- Six characters. One listening room.
- Everyone brings a song.
- Hear the drop together.
- Your room. Your rules.
