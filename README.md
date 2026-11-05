# MyProfile

Personal profile site for Mohammad Adil Shaikh, Lead UI/UX Designer. Built from the "Adil's Resume" Figma file (Profile section).

It is a static site with no build step: `index.html`, `styles.css`, `main.js` and the exported images in `assets/`.

## Run it locally

```
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Publish

Any static host works. For GitHub Pages, enable Pages on the default branch with the repository root as the source.

## How the Figma prototype maps to the site

| Figma | Site |
| --- | --- |
| Desktop 1, About, Experience, Tools, Portfolio frames | Five full-height sections, scaled from the 1440×1024 frame to fit the window |
| Nav links, scroll cues, "Back to Home" (smart animate 300ms) | Smooth scroll between sections with a fade-up reveal |
| Nav link hover variant | Text turns `#1ED987` over 300ms |
| Portrait hover variant (gentle, 1.79s) | Swaps to the outlined portrait and moves the tool icons |
| Social icon hover variants (dissolve 300ms) | Cross-fade to the brand colour icons |
| Google Drive click overlay (move in, 300ms) | Green "Request Now" toast, closes on outside click or Esc |
| "Let's Connect" overlay (centre, 80% navy backdrop) | Modal with tel and mailto links, closes on outside click or Esc |
| Experience 1/2/3 frames and draggable thumb | One scrollable list with a synced, draggable custom thumb |
| Portfolio card variants | Hover pans, zooms or steps through frames with the same timings; clicks open the linked prototypes |

On screens narrower than 900px the sections switch to a stacked layout, and the portfolio cards play their hover animation while they are on screen.
