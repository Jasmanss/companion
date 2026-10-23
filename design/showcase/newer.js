// 8. Added since the first showcase: what was built after it (quiet mode, step aside, notch alerts, the movable panel,
// auto mode, Visual Review) and the next piece of Visual Review, the big viewer, as designed. Short cards: what it does,
// its status, and the page or file it comes from. Each links to its own design page when there is one.
import { card } from './state.js'

const chips = (...items) => `<div class="chipset">${items.map(([t, on]) => `<span${on ? ' class="on"' : ''}>${t}</span>`).join('')}</div>`

export function render(host) {
  host.insertAdjacentHTML('beforeend', `<div class="grid">
    ${card({ id: 'n-quiet', section: 8, title: 'Quiet mode: Only when needed', status: 'app', from: ['src/main/presence.ts', 'src/main/alerts.ts'],
      desc: 'Steward can stay out of sight until it is needed. At the edge the tab slides in when you push the cursor against it; in the notch it sleeps until you rest the cursor there. Peek alerts have a filter, and a first-launch note says how to find it.',
      body: chips(['Always visible'], ['Only when needed', true], ['Peek alerts: Needs me', true], ['Everything'], ['Nothing'], ['Dims when idle', true]) })}
    ${card({ id: 'n-aside', section: 8, title: 'Step aside', status: 'app', from: 'src/main/step-aside.ts',
      desc: 'Steward gets out of the way when an app fills your screen or one on your list is in front (a call, a game). Alerts that come meanwhile wait and peek out once it is back.',
      body: chips(['Full-screen apps', true], ['Apps you list', true], ['Alerts wait', true]) })}
    ${card({ id: 'n-notch-alert', section: 8, title: 'Alerts under the notch', status: 'app', from: 'src/shared/notch.ts',
      desc: 'In the notch, an alert comes out under the menu bar as a black shape joined to the chin, with one line of text. A click opens the panel; a close button shows on hover. It never covers a menu bar item.',
      body: chips(['Joined to the chin', true], ['One line'], ['Click opens the panel'], ['Reduce Motion: a fade']) })}
    ${card({ id: 'n-notch-hover', section: 8, title: 'Notch hover, and the panel from the notch', status: 'app', from: 'src/main/notch-window.ts',
      desc: 'Resting the cursor on the notch grows the black a little and the eyes follow. A click opens the panel centered under the notch; every way of closing it goes back into the notch, never out to the side.',
      body: chips(['Hover grows the black', true], ['Panel drops from the notch', true], ['Closes into the notch', true]) })}
    ${card({ id: 'n-tab-drag', section: 8, title: 'Drag the tab along the edge', status: 'app', from: 'src/renderer/src/tab-drag.ts',
      desc: 'The tab at the screen edge can be dragged up or down to any height, and stays there. Settings has a Reset that puts it back in the middle.',
      body: chips(['Any height', true], ['Remembered per screen', true], ['Reset in Settings']) })}
    ${card({ id: 'n-movable', section: 8, title: 'The movable panel', status: 'app', from: 'movable-panel.html',
      desc: 'Drag the panel by its top bar and it opens where you left it, with a fade and a small grow. It closes in place. Double-click the bar, or Settings → Steward → Place → Reset, puts it back at its edge or the notch. The buttons still click.',
      tools: '<a class="btn" href="movable-panel.html">Open movable-panel.html</a>',
      body: chips(['Drag the top bar', true], ['Opens in place', true], ['Double-click puts it back', true], ['Phase 2: other screens']) })}
    ${card({ id: 'n-auto', section: 8, title: 'Auto mode for commands', status: 'app', from: 'src/main/commands.ts',
      desc: 'Settings → Running commands: Ask each time (the default) or Auto. Auto skips the Run click for commands it knows are safe. Anything risky, unknown or unreadable still asks: deletes, git push, deploys, installs and anything outside the project.',
      body: chips(['Ask each time', true], ['Auto'], ['Risky still asks', true]) })}
    ${card({ id: 'n-review', section: 8, title: 'Visual Review: the card', status: 'app', from: ['visual-review.html', 'src/renderer/src/ReviewCard.tsx'], cls: 'wide',
      desc: 'Give a project an App address in Settings. When a Claude Code turn ends, Steward photographs the page (on this Mac only) and, if it looks different, a card shows the page before and after with a slider. Looks good marks it reviewed. Send it back asks what should change and copies a note for the session. Later hides it until the panel opens again. Problems (nothing answering, a login page) show in the panel and Settings.',
      tools: '<a class="btn" href="visual-review.html">Open visual-review.html</a>',
      body: chips(['App address per project', true], ['Slider', true], ['Looks good', true], ['Send it back copies a note', true], ['Phase 2: the alert']) })}
    ${card({ id: 'n-viewer', section: 8, title: 'Visual Review: the big viewer', status: 'planned', from: ['visual-review-viewer.html'],
      desc: 'Designed, not built: open the card big, in the panel\'s big state, with Slide, Side by side and Flip, Fit and 100%, keys, and Looks good and Send it back inside it. Plus a one-line "Claude says" note on what changed, taken from Claude\'s own last message.',
      tools: '<a class="btn" href="visual-review-viewer.html">Open visual-review-viewer.html</a>',
      body: chips(['Slide · Side by side · Flip', true], ['100% = real pixels'], ['"Claude says" note', true], ['Needs your go']) })}
  </div>`)
}
