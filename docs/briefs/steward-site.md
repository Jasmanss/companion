# A showcase website for Steward

Status: ready

Set by the front door on the user's go, 2026-10-19: "Can we create e separate chat that makes the website." It's built by its own chat, Site building, one phase at a time, with the user's go between phases.

## Ask (front door)
The user's words: "what if we made a website to showcase steward for people to maybe use or view?" Their answers on 2026-10-19:
- **Goal:** show it off only. No download and no waitlist. SPEC.md says Steward is single user, so the site must not suggest people can get it.
- **Content (the user picked three):**
  - **Videos of the real app:** short clips (the tab sliding out, the Pill, quiet mode, the notch). The user records them, because Screen Recording is not granted for us.
  - **Try it in the browser:** a live demo built from the existing design pages (`design/showcase.html` already mocks the character, docking and panel).
  - **How it's built:** the multi-chat flow and CI on every phase. The code stays private, so show no private paths, session names or keys.
- **Not picked:** a features and roadmap section. A one-line intro of what Steward is, and nothing about upcoming features like Visual Review and Overnight Watch.
- **Home:** its own small site, hosted free.
- **Timing:** design now, build after quiet mode Phase 3. Going live is outward-facing and needs the user's OK at that time.
- **Direction added 2026-10-19:** "The website should feel like a product release. Like when apply changes there website for their new products like that." A product-launch page: a full-bleed hero, one idea per screen, scroll storytelling, cinematic clips, a specs-style close. Take the feel from such pages without copying them: no Apple logos, images, product names or wording.
- **Rules:** no new dependency without asking, no CDN libraries, no three.js or WebGL, Steward's look, animations tested at a normal frame rate in headless Chrome, plain language, no em dashes.

## Design (Roadmap & design)

### What it is
A product-launch page, one HTML file with no framework, in nine screens. The design page is `design/site.html` (a working page, open it and scroll). The page is built from the app's own look in HTML and CSS (the Ice tint, glass, the Pill, the edge tab, the notch), not from screenshots, so it stays light and sharp.

1. **Hero.** "Steward" very large, one tagline ("A small helper at the edge of your screen."), and a mock Mac screen that rises as you scroll while the tab slides out of the edge with the Pill's face on it.
2. **It comes to you.** The cursor stops at the edge, the tab slides out at that height, tucks away, and comes out again lower down.
3. **A face that tells you.** The Pill changes mood as you scroll: resting, thinking, talking, needs you, sleepy.
4. **Quiet until it matters.** A desktop with nothing on it, then one alert slides out.
5. **At home in the notch.** The notch is plain black, then the chin grows and the eyes wake up and follow the cursor.
6. **Ask. Watch. Done.** A small request, shown as the steps Steward takes.
7. **See it for real.** The five recorded clips, one full-width moment each.
8. **Try it.** The interactive demo.
9. **How it's built.** A spec sheet (Chats, Phases, Checks, CI, Merge, Code), then a closing line.

**One idea per screen, very little copy.** Each headline is two to five words and each sentence under 15. No feature lists, no roadmap, nothing about unbuilt features.

**Look: dark, one look, no toggle.** Chosen because the two things the page shows best are light on black: the Pill's lit eyes and the notch, which is black by nature. A dark page makes them glow, and it is how pro product pages usually look. The app's own panel and cards are glass, and they read well on dark. A light mode would halve the polish work (every scene would be designed twice) and make the notch scene weaker; a mixed page (some screens light) would break the "one object, lit from inside" feel. If the user wants light for daytime reading, a light version is an add-on after the first launch, not part of it.

**The honest line:** the closing screen says "A personal project, made for one person. It is not for sale and has no download or waitlist." The demo says "Nothing here is saved or sent anywhere." There is no download or buy button, and nothing that reads as a call to action. The top bar has only links to the page's own sections.

**Scroll storytelling (how it works):**
- Each of the six story screens is a tall box with a pinned screen inside (`position: sticky`). Scrolling through the box drives a "progress" from 0 to 1, and every moving part is a CSS keyframe animation on `transform` or `opacity` only.
- **In Chrome and other browsers with scroll-driven animations** (`animation-timeline: view()`), CSS drives it directly. **Everywhere else** a small script (about 15 lines) sets the progress on each scene from the scroll position, and the same keyframes follow it. Open the page with `?fallback` to force the script and compare. Both were checked and look the same.
- **Reduced motion:** with `prefers-reduced-motion` on, nothing is pinned and nothing moves with scroll. Every screen shows its finished picture (the moods become a row of five, the alert and both tabs are shown), the Pill's blinking stops, and smooth scrolling is off.
- **Phone:** the same scenes stack (headline above, mock below) and still pin.
- **No script at all:** the pinned scenes stay at their first state. Acceptable for a showcase page, noted as a known limit.
- **Cost:** no images, no fonts, no libraries; the whole page is one file of roughly 25 KB before the clips.

**Copy rules:** the intro line says what it does today (from SPEC). Nothing about Visual Review, Overnight Watch, or any planned feature. No names of the user's projects (SPEC.md lists some; the demos use "my-site"), no real folder paths, no names of chats or sessions, no PR numbers or links, no keys. "How it's built" says four chats with four roles, one phase at a time, CI on every phase, "more than 280 tests" (so it does not go stale), and that the code is private.

### The five clips (the user records them)
Silent, looping, each short. The site shows a poster image first and loads the video only when played, so the page stays light.

| # | Clip | Length | What to record |
|---|---|---|---|
| 1 | It comes to you | about 8 s | In "Only when needed", push the cursor to the right edge at one height, the tab slides out under it. Click, the panel opens, press Esc, it tucks away. Then push at a different height. |
| 2 | A face with moods | about 10 s | The panel open on a clean project: idle, listening, thinking (dots), talking, then sleepy and "needs you". |
| 3 | Quiet until it matters | about 8 s | A busy normal desktop (an editor or a browser) with no Steward visible, then one "needs you" alert slides out from the edge. |
| 4 | Living in the notch | about 8 s | The notch asleep, rest the cursor on it, the black grows and the eyes follow the cursor. (Record again after notch Phase 3, when the panel drops from the notch.) |
| 5 | A request, start to finish | about 15 s | Ask for something small in a demo project and show the steps and the answer. |

**Format and size (revisited for the launch layout, where each clip is a full-width moment):**
- All five clips are **16:10** (the same shape as a Mac screen), so every block on the page lines up. Crop to the part that matters: for the edge clips the right 60% of the screen, for the notch clip the top-center, always at 16:10.
- MP4, H.264, no audio track, 30 fps, **1280 pixels wide**, because the clips now show full width on large screens (960 would look soft). Aim for 3 to 4 MB each and no more than 16 MB for all five. `ffmpeg` is installed (`/opt/homebrew/bin/ffmpeg`), so Claude compresses the raw recordings, roughly `ffmpeg -i in.mov -an -vf "scale=1280:-2,fps=30" -c:v libx264 -crf 28 -preset slow -movflags +faststart out.mp4`, and extracts a poster frame (WebP or JPEG, about 80 KB).
- **Playback:** muted loops that start when the clip is in view and stop when it leaves, each with a visible Pause button (a keyboard-reachable control, so it is never a clip you cannot stop). Nothing downloads until the clip is near the screen: `preload="none"`, with the poster showing first. Reduced motion means no autoplay; the clip waits for the Play button.
- **Why shots may change:** the clips are the real thing, the scenes above are the explainer. If a scene already shows an idea well, its clip can be shorter. The user decides after seeing the first scenes live.
- **How to record:** the built-in ⌘⇧5 "Record Selected Portion". Record a part of the screen, not the whole thing.
- **Before recording:**
  - Use a demo project and a clean desktop: no personal tabs, bookmarks, notifications, other apps' windows or private project names. The menu bar shows personal items, so crop it out where possible.
  - **Quiet mode Phase 3 will hide Steward from screen recordings by default** (its "Hide from screen sharing" option). Record before Phase 3 lands, or switch that option off first, or the clips will show no Steward at all.
  - If the notch clip is recorded before notch Phase 3, it shows only the hover and the eyes.

### The live demo ("Try it")
- **What it is:** the real character and panel, running in the browser, taken from the existing design pages: `design/pill/`, `design/shared/` and a trimmed set of `design/showcase/` (the character and moods, a full request, the panel). The page in `design/site.html` mocks this with a mood picker and a color picker.
- **Trim, do not copy whole:** `design/showcase.html` carries an "Every feature" table with "Planned" tags, a docking section with unbuilt notch parts, and a Google Fonts link. The site's demo uses none of those: no feature list, no status tags, a system font stack instead of the web font. It must not show anything that is not built.
- **Isolation:** the demo runs in a same-origin iframe (`demo/index.html`), so the page and the demo cannot break each other.
- **Not allowed:** three.js, WebGL, the 3D design pages (`*-3d.html`), CDN libraries, new dependencies.
- **Neutral demo content:** project names like "my-site", no real names or paths. Mood "confused" is on the design pages but not in the app: leave it out.

### Where the code lives and where it is hosted (a recommendation)
- **Code: a `site/` folder in this private repo.** The live demo is built from files in `design/`, so keeping the site next to them means one source of truth and no copying between repos. A separate public repo would mean copying the demo files out and a second place to keep in sync, and everything in a public repo, including its history, is public for good. The packaged app ships only `out/**` (`electron-builder.yml`), so a `site/` folder does not end up in the app.
- **Host: Vercel, free (Hobby) plan.** Deploys from a private GitHub repo and publishes only the built output, so the source stays private. GitHub Pages is the obvious free alternative, but Pages on a private repo needs a paid plan, which is why it is not the pick. Netlify and Cloudflare Pages would also work and are fine alternatives if the user prefers one.
- **Build:** a small plain-Node script, `site/build.mjs` (no dependency), copies the page, the clips and the trimmed demo files into a git-ignored output folder. Vercel runs it: root directory `site/` or a build command, output folder named in the project settings.
- **Free address:** a `something.vercel.app` address. A custom domain (about 10 to 15 dollars a year) is optional and can be added later.
- **What the user sets up themselves:**
  1. A Vercel account (sign in with GitHub) and allow it to see this repo.
  2. Import the repo, set the root directory and build command (Claude gives the exact values).
  3. Optional: a domain, and its DNS records.
  4. Decide whether the first deploy is a preview only the user can open, or goes live. I believe Vercel keeps preview deployments behind a login by default; check at setup before relying on it.
- **Going live needs the user's OK at that time.** Publishing is outward-facing and not undone by deleting later (copies and caches can persist). Nothing is deployed until the user says so.

### Build phases (after quiet mode Phase 3; each its own draft PR into main, CI green before it counts as done)
1. **The page shell and the hero:** `site/index.html`, `site/build.mjs`, the dark look, the top bar, the hero with its scroll-driven screen, and the closing screen. Viewable locally. Includes the script fallback and the reduced-motion layout, because every later scene depends on them.
2. **The five scenes:** edge, moods, quiet, notch and request (they share the scene pattern from phase 1). Checked in headless Chrome at a normal frame rate, at desktop and phone width, with the script fallback and with reduced motion.
3. **A site check:** `site/check.mjs` (plain Node) that fails if the built site contains private strings (`/Users/`, `local_`, `claude/` branch names, `Jasmanss`, PR numbers, the SPEC project names, "planned", "Visual Review", "Overnight Watch"), a clip over 4 MB or 16 MB in total, an external URL, or a missing poster or label. Run it in CI.
4. **Clips:** the user records the five clips, Claude compresses them, adds posters, and turns the "See it for real" screen on (hidden until then, so no placeholders ship). Waits for the recordings.
5. **Try it and the spec sheet:** the trimmed demo build in an iframe, and the "How it's built" screen, with the check updated for them.
6. **Go live:** the user sets up Vercel (above), a protected preview first, then the user looks and says OK before anything is public.

### Files likely touched
- **New:** `site/` (page, CSS, `build.mjs`, `check.mjs`, clips and posters), a `site` entry in `.gitignore` for the output folder, and a CI step that runs the check.
- **Shared / config files, small and additive:** `eslint.config.js` (ignore the site's output folder; the app already ignores `design/**`), `.github/workflows/ci.yml` (run the site check), `package.json` (a `site:build` and `site:check` script).
- **Not touched:** anything under `src/`. The site is separate from the app.
- **Reads, does not change:** `design/pill/`, `design/shared/`, `design/showcase/`.

### Risks and open questions
1. **Leaks are the main risk.** The demo files and the clips both came from private work. The check in phase 2 helps; the clips need a human look before they are published, because a recording can show a tab, a path or a notification that no script can find.
2. **Clips age.** The app is still changing (quiet mode Phase 3, notch Phase 3). Re-recording is cheap, but the site should say nothing a clip would contradict.
3. **A "try it" demo is not the app.** It shows the character and the panel, not the real work Steward does. The page says so ("Nothing here is saved or sent anywhere"), and does not claim more.
4. **Vercel details to confirm at setup:** the preview protection default, and that the free plan's terms cover a personal showcase site. Both are the user's to check in their own account.
5. **Scroll motion is the main craft risk.** Scroll-driven animation is native in Chrome and other browsers that support it, and runs from a script elsewhere. On an old phone the script path could drop frames. Each scene is built so a dropped frame only looks slightly steppy, never broken, and reduced motion removes it entirely. Phase 2 tests at a normal frame rate; a real phone is the user's check.
6. **Name collision:** SPEC mentions an open check on whether the name Steward is taken. A public site makes that check more relevant. It is already on the ideas list ("Name availability check").

**Answered by the user (2026-10-19, via the front door):**
- **"How it's built" is OK to show publicly, as designed** ("Yes, show it"). It names the roles and the flow, and nothing about the code, the chats' names or any link.
- **Start on a free `.vercel.app` address.** A domain can come later.

### How to test
- **Page:** open `design/site.html` (and the build later) at 390, 820 and 1280 pixels wide and scroll slowly through every screen. Nothing may stutter at a normal frame rate (headless Chrome, not the throttled preview pane), nothing may overflow sideways, and every screen must read on its own.
- **Both drivers:** compare the page with and without `?fallback`; the scenes should look the same at the same scroll position.
- **Reduced motion:** turn it on in the system settings and check that every screen shows its finished picture and nothing moves or pins.
- **Keyboard:** the top-bar links, the demo's pickers and each clip's Pause button work by keyboard and show a focus ring.
- **Check script:** run it against a build that contains a planted bad string (a path, a "planned") and see it fail, then clean and see it pass.
- **Clips:** play each at phone width; total download for the first screen stays small (the videos do not load until played).
- **Demo:** every mood and color in the demo shows what the app shows, in headless Chrome at a normal frame rate. Compare with `design/moods.html`.
- **Before live:** open the protected preview on the user's phone, read the whole page once as a stranger would, and check no string from the check list appears.

## Result (Main building)
- What was built, files changed, check results
- Branch / worktree
- Anything unfinished or uncertain
