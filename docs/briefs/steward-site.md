# A showcase website for Steward

Status: ready

Set by the front door on the user's go, 2026-10-19: "Can we create e separate chat that makes the website." It's built by its own chat, Site building, one phase at a time, with the user's go between phases. **Redesigned 2026-11-11 around the user's vision (see below). Phase 2 waits for the user's go.** Phase 1 (the dark page shell) is merged and partly reused.

Set to ready again by the front door on the user's go, 2026-11-11, for the redesigned plan: "Yes, set it ready". Site building builds Phases 2 to 4, one at a time, with the user's go typed into Site building for each phase.

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
- **Direction added 2026-10-19:** "The website should feel like a product release. Like when apply changes there website for their new products like that." A product-launch page: a full-bleed hero, one idea per screen, scroll storytelling, cinematic clips, a specs-style close. Take the feel from such pages without copying them: no Apple logos, images, product names or wording. **Superseded 2026-11-11 by the vision below: the page is now light, not dark; the "product release" feel stays.**
- **Rules:** no new dependency without asking, no CDN libraries, no three.js or WebGL, Steward's look, animations tested at a normal frame rate in headless Chrome, plain language, no em dashes.
- **Vision, 2026-11-11 (the user's words):** "Lowkey I just want to finish this project so I can focus on other things. https://foundable.com/ I want the product website to look this with the video as well."
  - **What the front door saw there (desktop, 1512 wide):** a light page, not dark. A soft blue sky hero with a small friendly mascot above a big bold centered headline (about 66 px, system font), one short line, and a large white rounded input card. Directly under it, one product walkthrough video (about 55 s, 16:10, muted, looping, not preloaded, plays when it scrolls into view) in a light window frame with traffic-light dots, showing the real app in use. Then a story section (five steps with a progress line and a big animated panel), bento cards over a sky band, a dark rounded card, a FAQ, a big closing line and a plain footer.
  - **What changes:** light and airy instead of the dark one-look page. Steward's Pill takes the mascot's place. One long product video near the top is the centerpiece.
  - **What stays:** take the feel and layout, not their assets, mascot, names or wording; Steward's own look. The honesty rules (no sign-up, download, waitlist, pricing or call to action, and nothing that looks like it takes a request unless it is clearly the demo). No new dependency, no CDN, no three.js or WebGL, plain language, no em dashes.
  - **The user wants to be finished soon:** design the fewest phases and mark what can be cut. By default the user records the video (Screen Recording is not granted for us) and Claude compresses it.

## Design (Roadmap & design)

**Redesigned 2026-11-11 around the user's vision** (see "Vision" above). The October design (a dark, nine-screen scroll-story page with five short clips) is replaced. What it taught us is kept where it still holds: the honest line, the scroll and reduced-motion machinery, hosting, and the leak rules. `design/site.html` (the dark page) stays in the repo as a source of scenes, not as the target.

### The shortest path, in one paragraph
A light page with a big headline and the Pill, then **one product walkthrough video in a window frame**, then a short "how it's built" card and a closing line. That is three screens of work, almost all plain HTML and CSS. The video replaces the five short clips. The five animated scroll scenes, the "Try it" demo and any feature cards are **cut from the first launch** (they can be added later, one at a time). Three phases: the light page, the video, going live. If the user hands over the recording before the page phase ends, the first two phases become one.

### What the page is
One HTML file, no framework, light and airy, in this order. Each row says whether it can be cut.

| # | Screen | What it holds | Cut? |
|---|---|---|---|
| 1 | **Hero** | A soft blue sky gradient (CSS only, soft blobs from radial gradients, no clouds artwork). The Pill small and centered where a mascot would sit. A big bold centered headline, about 66 px on desktop, in the system font: "A small helper at the edge of your screen." One short line under it (under 15 words): "It waits out of the way, tells you when Claude needs you, and shows what it did." No input card, no button. | No |
| 2 | **The video** | One walkthrough, 45 to 60 s, in a light window frame (three dots, a thin title bar) that starts inside the hero's sky and overlaps its bottom edge. Muted, looping, plays when it scrolls into view, stops when it leaves, with a visible Pause button. Under the frame, **five chapter chips** (It comes to you, A face that tells you, Ask and watch, Quiet until it matters, At home in the notch). Pressing a chip jumps the video to that moment. | No |
| 3 | **How it's built** | A small dark rounded card on the light page: a short list on the left (four chats with four roles, one phase at a time, CI on every phase, more than 700 tests, the code is private), a line on the right. Text only, no icon grid. | Yes. Cheap (text only), but the page works without it. |
| 4 | **Closing** | A big line over the sky gradient: "A personal project, made for one person. It is not for sale and has no download or waitlist." A plain footer with one line of text. | No |

**Not on the page, on purpose:**
- **The five-step story section** (steps on the left with a progress line, a big animated panel on the right). The video already tells the same story, so this is the one real cost on the list and mostly repeats the video. Cut for the first launch. If wanted later, its five panels are the scenes already built in `design/site.html`, recolored, and the chips under the video become its step list.
- **"Try it" demo.** Cut for the first launch. Its spec is kept below in case the user wants it.
- **Bento feature cards and a FAQ.** The user did not pick a features section in October. The closing line answers the one question a FAQ would carry ("Can I get it?").

### The look, borrowed in feel and not in parts
Take from the reference: a light page, a sky-blue hero, a mascot-sized character above a big centered headline, one product video in a window frame right under it, big rounded cards, lots of air. **Do not take its assets, mascot, names or wording.** Steward's own look is used instead:
- **Colors and material:** the Ice tint's blue-white (Site building reads the values from the app's tint table and the Pill's `palette`), glass where a card floats, a plain flat card where it does not. No dark page: the October reason for dark (the notch and the lit eyes) is now carried by the video, where the notch is black on a real screen anyway.
- **The Pill** in the hero is the glass Pill. On the sky gradient its face can fade into the background, so the **fine edge rule from the notch island (Phase 4) applies: where the body is within contrast 2 of what is behind it, a thin darker edge.** The page's own CSS Pill from Phase 1 gets the same edge.
- **Type:** the system font, one weight pair (bold headlines, medium body). No web font, no CDN.
- **Phone:** the headline drops to about 36 px, the frame goes full width, the chips scroll sideways inside their own row (no page overflow).

### What Phase 1 gives us (merged, PR #23, `6629f38`)
Reused as is:
- `site/build.mjs`: the plain-Node build and local server (`npm run site:build`, `site:serve`). Its list of optional folders (`clips`, `posters`, `demo`) already fits; the walkthrough goes in `clips/` and its poster in `posters/`.
- The page's plumbing: the base64 Pill as the tab icon, the inline `.pill` CSS, the `prefers-reduced-motion` block, the closing section's copy.
- The scroll machinery (CSS `animation-timeline: view()` inside `@supports`, with the small script fallback and `?fallback`). Kept **only for the hero**: the Pill's tilt and the frame sliding up as you scroll. If that costs time, cut it: a static hero is fine.
- The private-string scan idea, grown into `site/check.mjs` (below).

Replaced: the dark palette, the "Steward" wordmark hero, the mock screen with the sliding tab (the video shows the real tab, so the mock is not needed), and the 230vh pinned scene.

### The video (the user records it)
**Why the user records:** Screen Recording is not granted to us, and a recording of the real app is the whole point of the page.

**Plan: one walkthrough, 45 to 60 s, no sound, one take if possible (retakes are cheap).** It also gives the five chapters:

| Time | Chapter | What happens on screen |
|---|---|---|
| 0:00 to 0:10 | It comes to you | A normal desktop with an editor open on a demo project. Steward is in "Only when needed", so nothing shows. Push the cursor to the right edge: the tab slides out under it. Click: the panel opens. |
| 0:10 to 0:20 | A face that tells you | The panel is open on a clean project with nothing asked. Let the Pill rest and blink for a few seconds. Press Esc: the panel tucks away. Push the cursor to the edge at a different height: the tab comes out there instead. |
| 0:20 to 0:35 | Ask and watch | Open the panel, ask for something small in the demo project (for example "run the tests and tell me what failed"). Let the steps appear and the answer finish: the Pill thinks, then talks. |
| 0:35 to 0:45 | Quiet until it matters | Close the panel. The desktop is busy and Steward is not on it. Start something in another session that will need you (a command that asks for approval): one alert slides out from the edge. Click Later or answer it. |
| 0:45 to 0:55 | At home in the notch | Rest the cursor on the notch: the black grows, the eyes wake and follow the cursor. Then move away: it goes back to sleep. Only works on a Mac with a notch. |

Cut any chapter that does not come out well; the chips under the video follow whatever is in it. **Only show what is built and that you have hand-tested.** Visual Review and Overnight Watch are built but not hand-tested yet, so the first video leaves them out. If they are tested before recording, a Visual Review beat (change a page, see the outline, send a note back) is the one to add. The page says nothing about them in the first version.

**How to record it (built into the Mac, no extra app, about 30 to 45 minutes with retakes):**
1. Clean the screen first (below). Use a demo project named something like "my-site".
2. Press **Cmd-Shift-5**. In the bar, click **Record Entire Screen** (the video icon with the full rectangle, not the dotted one).
3. Click **Options**: Save to a folder you can find (Desktop is fine), Timer **5 Seconds**, Microphone **None**, **Show Mouse Clicks** off, **Show Floating Thumbnail** off.
4. Click **Record**, switch to your desktop during the countdown, and do the walkthrough slowly. Move the cursor a bit more slowly than normal so it reads on a video. Leave about 1.5 s of stillness at the start and end.
5. Stop with the stop button in the menu bar (or **Cmd-Control-Esc**). The file is a `.mov`. Tell the front door where it is; Claude takes it from there.

**Keep out of frame (a script cannot find these, so a person must look):**
- **Menu bar:** drag personal icons off it (hold Cmd and drag them out), and turn off the clock's seconds and the battery percent if they bother you. The notch beat needs the menu bar visible, so it cannot be hidden.
- **Notifications:** turn on Do Not Disturb (a Focus) before recording, so no message, calendar alert or email preview slides in.
- **Desktop:** a neutral wallpaper, no files on the desktop, the Dock hidden (it also gets cropped).
- **Windows and tabs:** only the editor and Steward. No browser tabs, no other chats, no real project or folder names, no email, no API key, nothing from Settings that shows a key.
- **Steward's own cards:** the Sessions card lists real session names. Close the panel's Sessions card or use only demo-named sessions. Quiet mode's "Hide from screen sharing" option does not hide Steward from this recording and was left out, so use "In full-screen apps" and "Hide in these apps" only to step Steward aside if needed.

**What Claude does with it (ffmpeg is installed):** trims the stillness, crops to 16:10 by trimming the bottom (the Dock area; the menu bar and notch stay), scales to 1920 wide, 30 fps, H.264, no audio track, `+faststart`, roughly `ffmpeg -i in.mov -an -vf "crop=iw:iw*10/16:0:0,scale=1920:-2,fps=30" -c:v libx264 -crf 27 -preset slow -movflags +faststart walkthrough.mp4`. Aim for **8 to 10 MB and never over 12 MB** for 55 s. Also a poster frame (JPEG, about 100 KB; this ffmpeg cannot write WebP) and the chapter start times for the chips. The raw `.mov` is **not** committed; the final file is committed once, so the repo does not grow with every re-encode.
- **Playback:** `preload="none"` with the poster first, so the page's first load stays small. Starts when in view, stops when it leaves. A visible Pause button reachable by keyboard. With reduced motion there is no autoplay: the poster shows with a Play button.
- **Page weight:** the page itself is about 25 KB. The video downloads only when it is near the screen.

### Could Claude make the video instead? (checked, and I would not)
Honest answer: **partly, and not well enough to replace the recording.**

What exists and works with no Screen Recording permission and no new dependency:
- The app already takes pictures of its own windows with Electron's `webContents.capturePage()` in the smoke check, and the hidden smoke keeps every window real and drawn. A script could call it about 15 to 30 times a second per window and feed the frames to ffmpeg.
- A scripted request already exists: the `/demo` command plays made-up steps through the real panel with no API key (`src/main/demo.ts`, `STEWARD_SMOKE_DEMO`).

What that could show: the panel's own contents (chat, steps, cards, the Pill's moods), the edge tab's drawing, the notch window's contents (the island, the eyes), the quiet alert.

What it **cannot** show, and which are the very things that make a walkthrough convincing:
- **The desktop.** No wallpaper, menu bar, editor or other windows. We would have to draw a fake backdrop.
- **The frost.** macOS blurs what is behind the open panel (vibrancy), and that is part of the window, not the page. A capture never has it, so the panel would look flat and different from the real one. The glass Pill's own blur would work, but only over what is in its page.
- **The cursor.** Captures have no pointer. We would draw one, from a made-up path.
- **The edge tab sliding in, and the notch growing, over a wallpaper.** Those are the window itself moving or resizing, not the page. We would have to record each window's position per frame and compose it by hand over a fake desktop.
- **Real timing.** Frames come back at uneven times, and a window behind a full-screen app stops drawing.

Cost: a build phase in Main building for a capture and compose script (it would touch `src/main/index.ts`, a shared file), then fix-ups, to end with a staged mock that shows less than a real recording. **The user recording is faster (30 to 45 minutes) and shows the real thing.** If the user truly does not want to record, the fallback is a **panel-only video** made this way (the request chapter only, framed in our own window frame, saying nothing about the desktop). Say so and it can be a phase; it is not the default.

### The "Try it" demo (cut from the first launch; spec kept)
- **What it is:** the real character and panel, running in the browser, taken from the existing design pages: `design/pill/`, `design/shared/` and a trimmed set of `design/showcase/` (the character and moods, a full request, the panel).
- **Trim, do not copy whole:** `design/showcase.html` carries an "Every feature" table with "Planned" tags, a docking section with unbuilt notch parts, and a Google Fonts link. The site's demo uses none of those: no feature list, no status tags, a system font stack. It must not show anything that is not built. Mood "confused" is on the design pages but not in the app: leave it out.
- **Isolation:** a same-origin iframe (`demo/index.html`). **Not allowed:** three.js, WebGL, the 3D design pages, CDN libraries, new dependencies.
- **Honesty:** it says "Nothing here is saved or sent anywhere." It is the only thing on the page that may react to input, and it must be clearly a demo.

### Where the code lives and where it is hosted (unchanged, a recommendation)
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


### Build phases (the shortest path: three; each its own draft PR into main, CI green before it counts as done)
**While Phase 2 is built, the user records the video** (about 30 to 45 minutes, using the shot list above). That is the only thing that can run in parallel, and the reason the plan has three phases and not five.

1. **Phase 2: the light page.** In `site/index.html` (and a small CSS block in the same file): the sky hero with the Pill, headline and line; the video section's frame, chapter chips and playback code; "How it's built" (text only; cut it if it slows things down); the closing line and footer; the reduced-motion and phone layouts; `site/check.mjs` and its CI step. **The video section stays hidden until a video file exists, so no placeholder ships.** To test the layout, Site building makes a throwaway test clip with ffmpeg (not committed). Viewable locally with `npm run site:serve`.
2. **Phase 3: the video goes in.** Needs the recording. Claude compresses it, adds the poster, fills the chapter times, turns the section on, and runs the check with the size limit. Ends with a protected preview the user can open on their phone. **If the recording is ready before Phase 2 ends, 2 and 3 are one phase.**
3. **Phase 4: go live.** The user sets up Vercel (the list above); a protected preview first; the user reads the page once as a stranger would, and says OK before anything is public.

**What is cut, in the order to cut more if the user wants it faster:** (1) "How it's built" (saves a few hours of Phase 2 and about 2 KB); (2) the hero's scroll motion (the page works static); (3) the chapter chips (the video plays straight through). Already cut: the five-step scroll story, "Try it", feature cards, a FAQ. Any of them can be a later phase after the site is live.

### The site check (`site/check.mjs`, plain Node, run in CI)
Fails the build if the built site contains:
- **Private strings:** `/Users/`, `local_`, `claude/` branch names, `Jasmanss`, `Good Projects`, PR numbers, the SPEC project names, "planned", "Visual Review", "Overnight Watch" (until the user decides to show them).
- **Anything that looks like it takes a request:** `<form>`, `<input>`, `<textarea>`, `<select>`, a submit button, a `mailto:` link, or the words "sign up", "waitlist", "pricing", "buy now", "get started", "download". The one allowed sentence is the closing line ("It is not for sale and has no download or waitlist"); the check lists it by exact text. If the Try it demo is added later, its folder is the only place inputs are allowed.
- **Size and links:** a video over 12 MB, an image over 200 KB, an external URL, a missing poster or label, or `autoplay` without `muted`.

### Files likely touched
- **New:** `site/check.mjs`, `site/clips/walkthrough.mp4` and `site/posters/walkthrough.jpg` (Phase 3), a `site` entry in `.gitignore` for `site/dist` (check it is already there), a CI step that runs the check.
- **Changed:** `site/index.html` (rewritten light), `site/build.mjs` (probably nothing, maybe the video's content type).
- **Shared / config files, small and additive:** `eslint.config.js` (ignore `site/dist`), `.github/workflows/ci.yml` (run the site check), `package.json` (a `site:check` script).
- **Not touched:** anything under `src/`. The site is separate from the app.
- **Reads, does not change:** `design/site.html` (scenes, if the story section is added later), `design/pill/`, `design/shared/`.

### Risks and open questions
1. **Leaks are the main risk, and now it is one big file.** The recording shows a whole screen. A script cannot find a notification, a tab, a path or a real project name inside a video, so the user (and Claude, frame by frame, at a few seconds apart) must watch the whole thing before Phase 4. The check list above guards the page, not the video.
2. **The video ages.** The app is still changing (island Phase 5, reactions R3, Overnight Watch). One recording is cheap to redo, but the page and chips should claim only what the video shows. Plan to re-record only if something shown changes.
3. **A walkthrough is not a promise.** The closing line stays. The video shows a personal tool; nothing says people can get it.
4. **Looking like the reference.** The user asked for the feel and layout of a page that is a product signup funnel, with an input box in the hero. Steward has no signup, so the hero has no input box. If it looks bare without one, the video frame is the thing that fills that space; the user sees it in Phase 2 and can ask for more.
5. **Phone video weight.** 8 to 10 MB on a phone connection is a lot. `preload="none"` and the poster mean it only downloads when the user scrolls to it. A smaller phone file (720 wide, about 3 MB, chosen with a `media` source) is an easy add if the user cares; not in the first version.
6. **Vercel details to confirm at setup:** the preview protection default, and that the free plan's terms cover a personal showcase site. Both are the user's to check in their own account.
7. **Name collision:** SPEC mentions an open check on whether the name Steward is taken. A public site makes it more relevant. It is on the ideas list ("Name availability check").

**Answered by the user (2026-10-19, via the front door):**
- **"How it's built" is OK to show publicly** ("Yes, show it"): the roles and the flow, nothing about the code, the chats' names or any link.
- **Start on a free `.vercel.app` address.** A domain can come later.

### How to test
- **Page:** open the local build at 390, 820 and 1440 pixels wide and scroll slowly through it. At a normal frame rate (headless Chrome, not the throttled preview pane) nothing may stutter, nothing may overflow sideways, and every screen must read on its own.
- **Reduced motion:** turn it on; no autoplay, no scroll motion, the poster and a Play button show.
- **Keyboard:** the video's Pause button and each chip work by keyboard and show a focus ring.
- **Check script:** plant a bad string (a path, a `<form>`, "download") in the built site, see the check fail, remove it, see it pass.
- **Video:** it plays from the chips at the right moments, stops when scrolled away, and does not download until near the screen (watch the network list).
- **Before live:** open the protected preview on the user's phone, read the whole page as a stranger, and watch the video once through for anything private.

## Result (Main building)

### Redesign note (2026-11-11)
Phase 1 below built the dark page. After the user's vision (above) the remaining plan is Phases 2 to 4 in the Design section; the old Phases 2 to 6 (five scenes, check, clips, demo and spec sheet, go live) are replaced.


### Site Phase 1: the page shell and the hero (recorded 2026-10-19, from the front door)
Built by Site building, a separate long-lived chat. Status stays `ready`: phases 2 to 6 are not built.
- **Branch / PR:** `claude/site-phase-1`, commits `fe55d80`, `df664a3`, `91dc6cd`, `e000975`. Draft PR #23, CI running when recorded.
- **Built:** `site/index.html` (one 11 KB file, no images, fonts or URLs) and `site/build.mjs`, which copies into `site/dist/`.
  - The hero: a big "Steward" with a mock screen that rises while the tab slides out. On a phone the screen rises to the middle of the view.
  - The closing screen with the "personal project" line.
  - Motion: CSS inside `@supports` in Chrome, the script fallback elsewhere, and a reduced-motion layout.
  - The top bar has no links yet. Later phases add them with their sections.
- **Checks:** lint, typecheck and 285 tests, plus headless Chrome at 60 fps (desktop and phone, both scroll paths, and reduced motion) and a private-string scan of the built page.
- **Not checked:** a real phone, Safari and Firefox.
- **Next:** phase 2 (the five scenes) waits for the user's go, typed into Site building.
- **Merged (2026-10-20):** the user merged PR #23 into main: merge commit `6629f38`. Docs PR #22 (the Feature and Site building chats in CLAUDE.md) merged too (`6cc3bf6`). Phase 2 still waits for the user's vision talk about the website.

### Site Phase 2: the light page (recorded 2026-11-12, from the front door)
- **PR #55**, merge `4483bc5` (2026-11-12), on the user's OK. Status stays `ready`: Phases 3 and 4 are not built. CI green (Linux, macOS, CodeRabbit). Built by Site building.
- **Built:**
  - **The sky hero**, CSS only: the glass Pill with the fine edge, the headline "A small helper at the edge of your screen." and one line. No input box and no button. On scroll the Pill tilts down and the video frame rises.
  - **The video section:** a window frame, five chapter chips, muted playback while at least half of it is in view, a Pause button, no autoplay with reduced motion. **It is left out of the build, along with the top bar's "Watch" link, until the real recording exists**, so no placeholder ships.
  - **How it's built:** the dark text-only card. **The closing line** over the sky, and the footer.
  - **`site/check.mjs`** with 22 tests (`tests/site-check.test.ts`): it blocks private strings, unbuilt feature names, forms and sign-up words, outside URLs, heavy files, and a video with no poster or label. A planted bad page failed with all 10 problems listed. `npm run site:check` builds and checks, and CI runs it after the tests. `site:serve` now answers byte-range requests, so chips can jump within the video locally.
- **Where the build differs from the brief:** "AI chats with four roles" instead of "four chats"; the phone frame keeps a 12 px gutter; the poster is a JPEG (this ffmpeg cannot write WebP); the chip times are the shot list's placeholders until Phase 3. The front door added `71352a6`: the check's test had used a real local chat id as its sample, now a made-up one.
- **Checks:** lint, typecheck, 777 tests. Smoke skipped, no app code changed. Headless Chrome at 390, 820 and 1440 wide with no sideways overflow or console errors; the CSS and script scroll drivers match; reduced motion keeps everything still; eight scroll runs held 60 fps with a throwaway test clip playing (not committed), no frame over 20 ms; keyboard and focus rings checked.
- **Not checked:** Safari, Firefox, a real phone, the real recording, and whether Vercel serves byte ranges for the video (believed yes).
- **Next:** Phase 3 waits for the user's recording and then the user's go typed into Site building.
