# Mino Pilot — 70s Children's Story Test

Goal: turn Cartoon Studio into a reusable children's story production workflow using a rigged SVG character, ElevenLabs narration, scene animation, lip sync and MP4 rendering.

## Pilot

Title: **Mino ve Uyuyan Yıldız**
Target duration: **70 seconds**
Format: **1920x1080, 16:9**
Primary voice provider: **ElevenLabs**

## Character

Mino is bundled at:

`resources/defaults/characters/mino.svg`

The SVG includes Cartoon Studio's 9-shape mouth rig classes:

- mouth-X
- mouth-A
- mouth-B
- mouth-C
- mouth-D
- mouth-E
- mouth-F
- mouth-G
- mouth-H

## Scene

The first bundled story scene is:

`resources/defaults/scenes/scene-magic-forest.svg`

## Story beats

1. 0:00–0:08 — Mino explores the enchanted forest at night.
2. 0:08–0:16 — Mino notices a tiny fallen star glowing in the grass.
3. 0:16–0:24 — Mino approaches and discovers the star.
4. 0:24–0:34 — Mino gently picks it up.
5. 0:34–0:43 — Mino carries the star toward the highest hill.
6. 0:43–0:52 — The star begins to fade.
7. 0:52–1:00 — Mino makes a heartfelt wish and the star shines again.
8. 1:00–1:10 — The star rises back into the sky and lights Mino's home.

## Narration draft

Bir varmış, bir yokmuş… Uzaklarda, yıldızların geceleri ağaçların arasına kadar indiği küçük bir ormanda, Mino adında meraklı bir tavşan yaşarmış.

Bir gece Mino, çimenlerin arasında titreyen minicik bir ışık görmüş. Yaklaştığında bunun gökyüzünden düşmüş küçük bir yıldız olduğunu anlamış.

“Merak etme,” demiş Mino. “Seni evine götüreceğim.”

Yıldızı dikkatlice alıp ormanın en yüksek tepesine doğru yürümeye başlamış. Ama tepeye vardıklarında yıldızın ışığı iyice azalmış.

Mino gözlerini kapatmış ve bütün kalbiyle bir dilek tutmuş. Birden yıldız yeniden parlamaya başlamış!

Havaya yükselmiş, gökyüzündeki arkadaşlarının yanına dönmüş. O geceden sonra gökyüzündeki en parlak yıldız, her gece Mino'nun küçük evini aydınlatmış.

Çünkü gerçek dostluk, karanlıkta bile yolunu bulurmuş.

## Next implementation steps

1. Add a one-click **Children's Story / Mino Pilot** preset to the show picker.
2. Preload Mino + Magic Forest into the pilot show.
3. Add narrator-only mode so lip sync can remain optional when a narrator speaks off-screen.
4. Add reusable character actions: idle, blink, ear sway, look-up, walk-cycle illusion, pick-up, sad, happy, wave.
5. Add camera motion presets and foreground/background parallax.
6. Add star glow / particle animation to the composition renderer.
7. Generate ElevenLabs narration with timestamps and render the first 70-second MP4.
