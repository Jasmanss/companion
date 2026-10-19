# A showcase website for Steward

Status: designed

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
- **Rules:** no new dependency without asking, no CDN libraries, no three.js or WebGL, Steward's look, animations tested at a normal frame rate in headless Chrome, plain language, no em dashes.

## Design (Roadmap & design)

### What it is
One page, no framework: a header, a hero, "Watch it work" (five clips), "Try it" (a live demo), "How it's built", and a footer. Steward's own look (the Ice tint, glass panels, the system font, light and dark, phone width). The design page is `design/site.html`, a working mock of the whole page that the build copies the look from. In it the clips are placeholders and the demo is a small CSS mock of what the real one does.

**The honest line is in three places:** a note in the hero ("A personal project. It is not available to download."), the footer ("made for one person. It is not for sale and has no download or waitlist."), and nothing anywhere that could read as a call to action. No buttons that go anywhere except the page's own sections.

**Copy rules:** one-line intro (what it does today, from SPEC: it keeps watch while the user codes with Claude Code, tells them when a session needs them, collects screenshots in a tray, stays out of the way). Nothing about Visual Review, Overnight Watch, or any planned feature. No names of the user's projects (SPEC.md lists some), no real folder paths, no names of chats or sessions, no PR numbers or links, no keys. The "How it's built" section says "four chats with four roles", "one phase at a time", "CI on every phase", and a test count written as "more than 280" so it does not go stale; the code is called private.

### The five clips (the user records them)
Silent, looping, each short. The site shows a poster image first and loads the video only when played, so the page stays light.

| # | Clip | Length | What to record |
|---|---|---|---|
| 1 | It comes to you | about 8 s | In "Only when needed", push the cursor to the right edge at one height, the tab slides out under it. Click, the panel opens, press Esc, it tucks away. Then push at a different height. |
| 2 | A face with moods | about 10 s | The panel open on a clean project: idle, listening, thinking (dots), talking, then sleepy and "needs you". |
| 3 | Quiet until it matters | about 8 s | A busy normal desktop (an editor or a browser) with no Steward visible, then one "needs you" alert slides out from the edge. |
| 4 | Living in the notch | about 8 s | The notch asleep, rest the cursor on it, the black grows and the eyes follow the cursor. (Record again after notch Phase 3, when the panel drops from the notch.) |
| 5 | A request, start to finish | about 15 s | Ask for something small in a demo project and show the steps and the answer. |

**Format and size (what keeps the page light):**
- MP4, H.264, no audio track, 30 fps, 960 pixels wide at most (crop to the part of the screen that matters, for example the right third for the edge, rather than the whole display).
- Aim for 2 to 3 MB per clip and no more than 12 MB for all five. `ffmpeg` is installed on this Mac (`/opt/homebrew/bin/ffmpeg`), so Claude can compress the raw recordings: roughly `ffmpeg -i in.mov -an -vf "scale=960:-2,fps=30" -c:v libx264 -crf 28 -preset slow -movflags +faststart out.mp4`. A poster frame of about 60 KB each (WebP or JPEG) comes from the same tool.
- Markup: `<video muted loop playsinline preload="none" poster="...">`, with a play button, and the reduced-motion setting means no autoplay.
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
1. **Site shell:** `site/index.html`, its CSS, the hero, how-it-built and footer copy, and `site/build.mjs`, viewable locally. The "Watch" and "Try it" sections are hidden until they have real content, so no placeholders ship.
2. **A site check:** `site/check.mjs` (plain Node) that fails if the built site contains private strings (`/Users/`, `local_`, `claude/` branch names, `Jasmanss`, PR numbers, the SPEC project names, "planned", "Visual Review", "Overnight Watch"), a clip over 3 MB or more than 12 MB in total, an external URL other than links the user approves, or a missing alt/poster. Run it in CI.
3. **Clips:** the user records the five clips, Claude compresses them, adds posters, and turns the "Watch" section on. This phase waits for the recordings.
4. **Live demo:** the trimmed demo build and the iframe section, with the check updated for it. Test animations in headless Chrome at a normal frame rate, and at phone width.
5. **Go live:** the user sets up Vercel (above), a protected preview first, then the user looks and says OK before anything is public.

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
5. **Name collision:** SPEC mentions an open check on whether the name Steward is taken. A public site makes that check more relevant. It is already on the ideas list ("Name availability check").

**Answered by the user (2026-10-19, via the front door):**
- **"How it's built" is OK to show publicly, as designed** ("Yes, show it"). It names the roles and the flow, and nothing about the code, the chats' names or any link.
- **Start on a free `.vercel.app` address.** A domain can come later.

### How to test
- **Page:** open `design/site.html` (and the build later) in a browser at 375, 768 and 1100 pixels wide, in light and dark. No horizontal scroll, the demo's pickers work by keyboard, reduced motion stops the blinking.
- **Check script:** run it against a build that contains a planted bad string (a path, a "planned") and see it fail, then clean and see it pass.
- **Clips:** play each at phone width; total download for the first screen stays small (the videos do not load until played).
- **Demo:** every mood and color in the demo shows what the app shows, in headless Chrome at a normal frame rate. Compare with `design/moods.html`.
- **Before live:** open the protected preview on the user's phone, read the whole page once as a stranger would, and check no string from the check list appears.

## Result (Main building)
- What was built, files changed, check results
- Branch / worktree
- Anything unfinished or uncertain
