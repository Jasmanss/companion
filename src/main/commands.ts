import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isSecretPath } from './files'

// Anything that could chain, redirect, or expand into a different command.
const SHELL_SYNTAX = /[;&|<>`$\\(){}*?!\n]/
const MAX_OUTPUT = 40_000
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;?]*[A-Za-z]', 'g')

export function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

/**
 * Deploys, rollbacks and pushes (which deploy through Git integrations) always show the approval card,
 * whatever the allowlist says.
 */
export function alwaysAsks(command: string): boolean {
  const normalized = normalizeCommand(command).toLowerCase()
  return (
    /(^|\s)(npx |pnpm dlx |bunx |yarn dlx )?(vercel|vc)(\s|$)/.test(normalized) ||
    /\b(deploy|deployment|rollback|promote|redeploy)\b/.test(normalized) ||
    /\bgit\s+push\b/.test(normalized)
  )
}

/** Allowlisted commands run without an approval card; only exact, plain commands qualify. */
export function isAllowlisted(command: string, allowlist: string[]): boolean {
  const normalized = normalizeCommand(command)
  if (!normalized || SHELL_SYNTAX.test(normalized) || alwaysAsks(normalized)) return false
  return allowlist.some((entry) => normalizeCommand(entry) === normalized)
}

/* ---------- Auto mode: which commands are risky ---------- */

/** The command can't be read with confidence, which counts as risky. */
class Unparseable extends Error {}
const unparseable = (): never => {
  throw new Unparseable()
}

interface Redirect {
  op: string
  target: string
}

/** One command of a chain: its words, with quotes and escapes resolved, and its redirections. */
interface Simple {
  words: string[]
  redirects: Redirect[]
}

/**
 * Splits a command line into the commands it runs: on `;` `&&` `||` `|`, newlines and ( ) groups, resolving quotes
 * and escapes the way the shell does. It throws for what it can't read with confidence: expansions ($ and
 * backticks), here-documents, process substitution, background jobs, comments, and quotes or parentheses that
 * don't balance.
 */
class Splitter {
  private simples: Simple[] = []
  private cur: Simple = { words: [], redirects: [] }
  private word = ''
  private inWord = false
  private quoted = false
  /** A redirection operator waiting for the word that says where it goes. */
  private redirect: string | null = null
  private depth = 0
  /** Just after a ")": only an operator may follow. */
  private closed = false
  /** Just after `&&`, `||` or `|`: a command has to follow. */
  private needsCommand = false

  constructor(private readonly text: string) {}

  run(): Simple[] {
    const t = this.text
    for (let i = 0; i < t.length; i++) {
      const ch = t.charAt(i)
      const next = t.charAt(i + 1)
      if (ch === ' ' || ch === '\t') this.endWord()
      else if (ch === '\n') this.endCommand(';')
      else if (ch < ' ' || ch === '\x7f') unparseable()
      else if (ch === "'") i = this.single(i)
      else if (ch === '"') i = this.double(i)
      else if (ch === '\\') {
        if (next === '') unparseable()
        i++
        // A backslash before a newline joins the lines; before anything else it makes that character plain.
        if (next !== '\n') this.add(next, true)
      } else if (ch === '`') unparseable()
      else if (ch === '$') {
        // A lone $ is just a dollar sign; anything after it is an expansion.
        if (next !== '' && !/\s/.test(next)) unparseable()
        this.add('$')
      } else if (ch === ';') {
        if (next !== '' && ';&|'.includes(next)) unparseable()
        this.endCommand(';')
      } else if (ch === '|') {
        if (next === '&') unparseable()
        if (next === '|') i++
        this.endCommand(next === '|' ? '||' : '|')
      } else if (ch === '&' && next === '&') {
        i++
        this.endCommand('&&')
      } else if (ch === '<' || ch === '>' || ch === '&') i = this.redirection(i)
      else if (ch === '(') {
        if (this.inWord || this.cur.words.length > 0 || this.cur.redirects.length > 0 || this.redirect !== null || this.closed) unparseable()
        this.depth++
      } else if (ch === ')') {
        if (this.depth === 0) unparseable()
        this.depth--
        this.endCommand(')')
      } else if (ch === '#' && !this.inWord) unparseable()
      else this.add(ch)
    }
    if (this.depth !== 0) unparseable()
    this.endCommand(';')
    return this.simples
  }

  private add(text: string, quoted = false): void {
    if (!this.inWord) {
      if (this.closed) unparseable()
      this.inWord = true
      this.word = ''
      this.quoted = false
    }
    this.word += text
    if (quoted) this.quoted = true
  }

  private endWord(): void {
    if (!this.inWord) return
    if (this.redirect !== null) {
      this.cur.redirects.push({ op: this.redirect, target: this.word })
      this.redirect = null
    } else this.cur.words.push(this.word)
    this.inWord = false
  }

  private endCommand(op: ';' | '&&' | '||' | '|' | ')'): void {
    this.endWord()
    if (this.redirect !== null) unparseable()
    if (this.cur.words.length === 0 && this.cur.redirects.length === 0) {
      // Nothing before `&&`, `||` or `|` (unless a group just ended), and nothing after one.
      if (this.needsCommand || (!this.closed && (op === '&&' || op === '||' || op === '|'))) unparseable()
    } else this.simples.push(this.cur)
    this.cur = { words: [], redirects: [] }
    this.needsCommand = op === '&&' || op === '||' || op === '|'
    this.closed = op === ')'
  }

  private single(i: number): number {
    const end = this.text.indexOf("'", i + 1)
    if (end < 0) unparseable()
    this.add(this.text.slice(i + 1, end), true)
    return end
  }

  private double(start: number): number {
    const t = this.text
    this.add('', true)
    for (let i = start + 1; i < t.length; i++) {
      const c = t.charAt(i)
      const n = t.charAt(i + 1)
      if (c === '"') return i
      if (c === '`' || (c === '$' && /[A-Za-z0-9_{(\[?!@*#$-]/.test(n))) unparseable()
      if (c === '\\' && n !== '' && '$`"\\\n'.includes(n)) {
        i++
        if (n !== '\n') this.add(n, true)
      } else this.add(c, true)
    }
    return unparseable()
  }

  /** A `<`, `>` or `&>` at i: the redirection starts, and the next word is where it goes. Returns where it ends. */
  private redirection(i: number): number {
    const t = this.text
    const ch = t.charAt(i)
    const n1 = t.charAt(i + 1)
    if (ch === '&' && n1 !== '>') unparseable() // a background job
    // The 2 of 2>&1 is a file descriptor, not a word.
    if (this.inWord && !this.quoted && this.redirect === null && /^\d+$/.test(this.word)) this.inWord = false
    else this.endWord()
    if (this.redirect !== null || this.closed) unparseable()
    let op = ch
    if (ch === '&') {
      op = t.charAt(i + 2) === '>' ? '&>>' : '&>'
      i += op.length - 1
    } else if (ch === '>' && (n1 === '>' || n1 === '&' || n1 === '|')) {
      op = ch + n1
      i++
    } else if (ch === '<' && n1 === '&') {
      op = '<&'
      i++
    } else if (n1 === '(' || (ch === '<' && (n1 === '<' || n1 === '>'))) unparseable() // process substitution, here-documents
    this.redirect = op
    return i
  }
}

const GLOB = /[*?[\]{}]/
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/
/** Variables that are fine to set for one command. Others (PATH, NODE_OPTIONS, GIT_SSH_COMMAND…) change what runs. */
const SAFE_ENV = new Set(['CI', 'NODE_ENV', 'FORCE_COLOR', 'NO_COLOR', 'TZ', 'LANG', 'LC_ALL'])
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i

interface Ctx {
  /** The project folder, resolved. */
  root: string
  /** Missing when the caller can't say: mv and cp then count what they write onto as existing, and npx the tool as not installed. */
  exists?(absolute: string): boolean
  /** An earlier command did `cd` into the project, so a `..` can no longer be measured from the root. */
  cd: boolean
}
/** Whether a command with these arguments is risky. */
type Rule = (args: string[], ctx: Ctx) => boolean

const within = (root: string, absolute: string) => absolute === root || absolute.startsWith(root + path.sep)

/** The places a word could name: itself, the value of `--flag=value`, each of `a:b,c`, and the `/x` of a glued `-o/x`. */
function pathPieces(word: string): string[] {
  if (URL_LIKE.test(word) && !/^file:/i.test(word)) return []
  const value = word.replace(/^(-{1,2}[A-Za-z0-9][\w-]*|[A-Za-z_]\w*)=/, '')
  const pieces = [word, ...value.split(/[:,]/)]
  if (/^-[A-Za-z]./.test(word)) pieces.push(word.slice(2))
  return pieces
}

/** The word names a place outside the project folder (or `~`), or a secret file like .env. */
function outsideOrSecret(word: string, ctx: Ctx): boolean {
  return pathPieces(word).some((piece) => {
    if (piece.startsWith('~')) return true
    if (piece === '/dev/null') return false
    let relative: string
    if (piece.startsWith('/')) {
      const absolute = path.resolve(piece)
      if (!within(ctx.root, absolute)) return true
      relative = path.relative(ctx.root, absolute)
    } else {
      if (piece.split('/').includes('..') && (ctx.cd || !within(ctx.root, path.resolve(ctx.root, piece)))) return true
      relative = path.normalize(piece)
    }
    return !piece.startsWith('-') && isSecretPath(relative)
  })
}

const isFlag = (a: string) => a.length > 1 && a.startsWith('-') && a !== '--'
const operands = (args: string[]) => args.filter((a) => !isFlag(a) && a !== '--')
const shortHas = (a: string, letters: string) => /^-[A-Za-z0-9]+$/.test(a) && [...a.slice(1)].some((c) => letters.includes(c))
const hasShort = (args: string[], letters: string) => args.some((a) => shortHas(a, letters))
const longName = (a: string) => (a.startsWith('--') ? a.slice(2).split('=')[0] : '')
const hasLong = (args: string[], ...names: string[]) => args.some((a) => names.includes(longName(a)))
const only = (args: string[], ...exact: string[]) => args.length === 1 && exact.includes(args[0])

const RULES = new Map<string, Rule>()
const never: Rule = () => false
// Commands that only read, or that make new things without touching what exists (mkdir, touch), or that are the
// project's own dev tools. Anything not named here (and not given a rule below) counts as risky.
for (const name of [
  'ls', 'll', 'la', 'pwd', 'cat', 'bat', 'head', 'tail', 'wc', 'stat', 'du', 'df', 'which', 'whereis', 'type',
  'echo', 'printf', 'uname', 'whoami', 'hostname', 'id', 'true', 'false', 'test', '[', 'basename', 'dirname', 'realpath', 'readlink',
  'cut', 'tr', 'column', 'fold', 'nl', 'paste', 'comm', 'diff', 'cmp', 'od', 'hexdump', 'md5', 'md5sum', 'shasum', 'sha1sum',
  'sha256sum', 'cksum', 'pgrep', 'lsof', 'uptime', 'sw_vers', 'nproc', 'sleep', 'seq', 'mkdir', 'touch',
  'tsc', 'eslint', 'prettier', 'vitest', 'jest', 'vite', 'next', 'webpack', 'rollup', 'esbuild', 'pytest', 'ruff', 'mypy', 'black', 'flake8',
]) RULES.set(name, never)

// Reading is fine, but not what hands a process's environment (or the API keys in it) back to the model, or sweeps up
// .env files on the way: a recursive grep from the top, rg with its ignore rules off.
RULES.set('jq', (args) => args.some((a) => /\benv\b|\$ENV/.test(a)))
RULES.set('ps', (args) => args.some((a) => /e/i.test(a.replace(/^-+/, ''))))
const grep: Rule = (args) => {
  const recursive = hasShort(args, 'rR') || hasLong(args, 'recursive', 'dereference-recursive')
  const places = operands(args).slice(1)
  return recursive && (places.length === 0 || places.some((p) => p === '.' || p === './' || p === '*'))
}
for (const name of ['grep', 'egrep', 'fgrep']) RULES.set(name, grep)
RULES.set('rg', (args) => hasShort(args, 'uz') || hasLong(args, 'unrestricted', 'hidden', 'no-ignore', 'no-ignore-vcs', 'search-zip') || args.some((a) => longName(a).startsWith('pre')))
RULES.set('sort', (args) => hasShort(args, 'o') || hasLong(args, 'output', 'compress-program'))
RULES.set('uniq', (args) => operands(args).length > 1)
RULES.set('tree', (args) => hasShort(args, 'o') || hasLong(args, 'fromfile'))
RULES.set('date', (args) => hasShort(args, 's') || hasLong(args, 'set'))
RULES.set('find', (args) => args.some((a) => ['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls'].includes(a)))
RULES.set('defaults', (args) => !['read', 'read-type', 'domains', 'find'].includes(args[0] ?? ''))
RULES.set('make', (args) => operands(args).some((o) => /clean|install|purge|nuke|wipe|reset|destroy|drop|publish|release/i.test(o)))

RULES.set('cd', (args, ctx) => {
  if (args.length !== 1 || args[0].startsWith('-') || GLOB.test(args[0])) return true
  ctx.cd = true
  return false
})

/** Only `sed -n '12,40p' file`: other scripts can write files (w, -i) or run commands (e). */
RULES.set('sed', (args) => {
  const flags = args.filter(isFlag)
  const quiet = flags.some((f) => f === '-n' || f === '--quiet' || f === '--silent')
  const plain = flags.every((f) => ['-n', '--quiet', '--silent', '-E', '-r', '--regexp-extended'].includes(f))
  return !(quiet && plain && /^(\d+|\$)(,(\d+|\$))?p$/.test(operands(args)[0] ?? ''))
})

/** cp and mv are fine onto a place that doesn't exist yet; onto one that does, they overwrite. */
const copyOrMove =
  (flags: string): Rule =>
  (args, ctx) => {
    const files: string[] = []
    for (const a of args) {
      if (a === '--') continue
      if (a.startsWith('--') ? !['--recursive', '--verbose', '--force', '--no-clobber'].includes(a) : isFlag(a) && !new RegExp(`^-[${flags}]+$`).test(a)) return true
      if (!isFlag(a)) files.push(a)
    }
    // After a cd, "where it goes" can't be measured from the project folder; a glob or a folder's slash hides the real path.
    if (ctx.cd || files.length !== 2 || files.some((f) => GLOB.test(f)) || files[1].endsWith('/')) return true
    return ctx.exists?.(path.resolve(ctx.root, files[1])) ?? true
  }
RULES.set('cp', copyOrMove('rRapvfnHLP'))
RULES.set('mv', copyOrMove('vfn'))

const CURL_LONG_WRITES = [
  'output', 'output-dir', 'remote-name', 'remote-name-all', 'remote-header-name', 'data', 'data-raw', 'data-binary', 'data-urlencode', 'data-ascii',
  'form', 'form-string', 'upload-file', 'json', 'request', 'post301', 'post302', 'post303', 'cookie-jar', 'dump-header', 'config', 'trace',
  'trace-ascii', 'stderr', 'create-dirs', 'etag-save', 'libcurl',
]
/** A GET that prints. Saving to a file, sending data, or a method other than GET is a write. Long options may be shortened. */
RULES.set('curl', (args) => hasShort(args, 'oOJdFTKcDX') || args.some((a) => longName(a) !== '' && CURL_LONG_WRITES.some((name) => name.startsWith(longName(a)))))

// node, and the runners that take a script the same way: a script file to run, never code on the command line or stdin.
const NODE_VALUE_FLAGS = new Set(['-r', '--require', '--import', '--loader', '--env-file', '--conditions', '-C'])
const runsScript: Rule = (args) => {
  if (only(args, '-v', '--version')) return false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--test') return false
    if (a === '-' || hasLong([a], 'eval', 'print') || shortHas(a, 'ep')) return true
    if (NODE_VALUE_FLAGS.has(a)) i++
    else if (!isFlag(a)) return false
  }
  return true
}
for (const name of ['node', 'tsx', 'ts-node']) RULES.set(name, runsScript)

const PYTHON_MODULES = new Set(['pytest', 'unittest', 'mypy', 'ruff', 'black', 'flake8', 'pylint', 'json.tool'])
RULES.set('python', (args) => {
  if (only(args, '-V', '--version')) return false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-' || shortHas(a, 'c')) return true
    if (a === '-m') return !PYTHON_MODULES.has(args[i + 1] ?? '')
    if (!isFlag(a)) return false
  }
  return true
})

const CARGO_SAFE = new Set(['build', 'b', 'check', 'c', 'test', 't', 'run', 'r', 'fmt', 'clippy', 'doc', 'bench', 'tree', 'metadata', 'version', 'help', 'fetch'])
RULES.set('cargo', (args) => {
  const sub = args.find((a) => !isFlag(a))
  return sub === undefined ? !only(args, '--version', '-V') : !CARGO_SAFE.has(sub)
})
RULES.set('go', (args) => (args[0] === 'env' ? args.some((a) => a === '-w' || a === '-u') : !['build', 'test', 'vet', 'run', 'version', 'list', 'doc'].includes(args[0] ?? '')))

// Package managers. npm has its own list of safe commands; yarn, pnpm and bun also run a script by its bare name
// (`pnpm build`), so for them it's the other way round: a list of what's risky.
const PACKAGE_VALUE_FLAGS = new Set(['--prefix', '-w', '--workspace', '--registry', '--loglevel', '--userconfig', '--cache', '-C', '--filter', '-F', '--dir', '--cwd'])
function packageCommand(args: string[]): { sub: string | undefined; rest: string[] } {
  let i = 0
  while (i < args.length && args[i].startsWith('-')) i += PACKAGE_VALUE_FLAGS.has(args[i]) ? 2 : 1
  return { sub: args[i], rest: args.slice(i + 1) }
}
const NPM_SAFE = new Set([
  'run', 'run-script', 'rum', 'urn', 'test', 't', 'tst', 'start', 'stop', 'restart', 'ls', 'list', 'll', 'la', 'view', 'v', 'info', 'show', 'outdated',
  'why', 'explain', 'root', 'bin', 'prefix', 'help', 'whoami', 'ping', 'search', 'fund', 'docs', 'doc', 'repo', 'bugs', 'audit', 'config', 'c',
])
RULES.set('npm', (args) => {
  if (only(args, '-v', '--version')) return false
  const { sub, rest } = packageCommand(args)
  if (sub === undefined || !NPM_SAFE.has(sub)) return true
  if (sub === 'audit') return operands(rest).includes('fix')
  if (sub === 'config' || sub === 'c') return !['get', 'list', 'ls'].includes(operands(rest)[0] ?? '')
  return false
})
const PACKAGE_RISKY = new Set([
  'install', 'i', 'add', 'a', 'remove', 'rm', 'uninstall', 'un', 'unlink', 'link', 'ln', 'update', 'up', 'upgrade', 'upgrade-interactive', 'ci', 'dedupe',
  'prune', 'rebuild', 'import', 'init', 'create', 'c', 'dlx', 'x', 'exec', 'global', 'config', 'set', 'login', 'logout', 'store', 'patch', 'patch-commit',
  'patch-remove', 'env', 'self-update', 'setup', 'fetch', 'deploy', 'pack', 'publish', 'unpublish', 'deprecate', 'version', 'cache', 'approve-builds',
  'pm', 'workspace', 'workspaces', 'node', 'install-test', 'it',
])
const scriptRunner =
  (...extraRisky: string[]): Rule =>
  (args) => {
    if (only(args, '-v', '--version')) return false
    const { sub, rest } = packageCommand(args)
    if (sub === undefined || PACKAGE_RISKY.has(sub) || extraRisky.includes(sub)) return true
    return sub === 'audit' && operands(rest).includes('fix')
  }
RULES.set('yarn', scriptRunner())
RULES.set('pnpm', scriptRunner())
RULES.set('bun', scriptRunner('build', 'repl', 'upgrade'))

/** npx runs what is already installed in the project; anything it would download or run from a string asks. */
const NPX_FLAGS = new Set(['--no', '--no-install', '-q', '--quiet'])
RULES.set('npx', (args, ctx) => {
  let i = 0
  for (; i < args.length && isFlag(args[i]); i++) if (!NPX_FLAGS.has(args[i])) return true
  const tool = args[i]
  if (ctx.cd || tool === undefined || !/^[a-z0-9][a-z0-9._-]*$/i.test(tool)) return true
  return !(ctx.exists?.(path.join(ctx.root, 'node_modules', '.bin', tool)) ?? false)
})

/**
 * Git: reading, staging, committing, and making branches are fine. What rewrites history, throws work away, or reaches
 * the remote asks, and so do `remote` and `config`, whose output can hold a token in a remote's URL.
 */
const GIT_PLAIN_OPTIONS = new Set(['--no-pager', '-P', '--paginate', '-p', '--no-optional-locks', '--no-replace-objects'])
const GIT_SUBCOMMANDS = new Map<string, (args: string[]) => boolean>()
for (const name of [
  'status', 'diff', 'log', 'show', 'blame', 'ls-files', 'ls-tree', 'ls-remote', 'rev-parse', 'rev-list', 'describe', 'shortlog', 'cat-file', 'diff-tree',
  'merge-base', 'show-ref', 'name-rev', 'check-ignore', 'count-objects', 'for-each-ref', 'version', 'help', 'add',
]) GIT_SUBCOMMANDS.set(name, () => false)
GIT_SUBCOMMANDS.set('grep', (args) => args.some((a) => /^-[A-Za-z]*O/.test(a) || a.startsWith('--open-files')))
// A refspec (a:b) can move a local branch, and --force can overwrite it.
GIT_SUBCOMMANDS.set('fetch', (args) => args.some((a) => a === '-f' || a === '--force' || a.includes(':')))
GIT_SUBCOMMANDS.set('commit', (args) => hasLong(args, 'amend'))
GIT_SUBCOMMANDS.set('branch', (args) => args.some((a) => shortHas(a, 'dDmMfCcu') || hasLong([a], 'delete', 'move', 'force', 'copy', 'edit-description', 'set-upstream-to', 'unset-upstream')))
GIT_SUBCOMMANDS.set('tag', (args) => args.some((a) => shortHas(a, 'df') || hasLong([a], 'delete', 'force')))
GIT_SUBCOMMANDS.set('switch', (args) => args.some((a) => isFlag(a) && !['-c', '--create', '-d', '--detach', '-q', '--quiet', '-t', '--track', '--no-track'].includes(a)))
// Checking out a branch or a path can overwrite changes; only a new branch (-b) is safe.
GIT_SUBCOMMANDS.set('checkout', (args) => !(args[0] === '-b' && args.length >= 2 && args.slice(1).every((a) => !a.startsWith('-'))))
GIT_SUBCOMMANDS.set('stash', (args) => !['list', 'show'].includes(args[0] ?? ''))
GIT_SUBCOMMANDS.set('worktree', (args) => operands(args)[0] !== 'list')
GIT_SUBCOMMANDS.set('reflog', (args) => operands(args).some((o) => o === 'expire' || o === 'delete'))
// Only taking files out of the index: a flag (--hard, --soft…) or any commit to move to is a reset.
GIT_SUBCOMMANDS.set('reset', (args) => args.some(isFlag) || (operands(args).length > 0 && operands(args)[0] !== 'HEAD' && !args.includes('--')))
RULES.set('git', (args) => {
  if (only(args, '--version')) return false
  let i = 0
  for (; i < args.length && args[i].startsWith('-'); i++) {
    if (args[i] === '-C') i++ // its folder is checked like any other path
    else if (!GIT_PLAIN_OPTIONS.has(args[i])) return true
  }
  const sub = args[i]
  const rest = args.slice(i + 1)
  const rule = sub === undefined ? undefined : GIT_SUBCOMMANDS.get(sub)
  // --output=file makes diff, log and show write a file.
  return rule === undefined || rest.some((a) => a.startsWith('--output')) || rule(rest)
})

/** The rule for a command word: a plain name, or a tool in the project's node_modules/.bin. Undefined for anything unknown. */
function ruleFor(command: string): Rule | undefined {
  const local = /^(?:\.\/)?node_modules\/\.bin\/([\w.-]+)$/.exec(command)
  const name = local ? local[1] : command
  if (name.includes('/')) return undefined
  return RULES.get(/^python3?(\.\d+)?$/.test(name) ? 'python' : name)
}

function redirectRisky({ op, target }: Redirect, ctx: Ctx): boolean {
  if (op === '<') return GLOB.test(target) || outsideOrSecret(target, ctx)
  // 2>&1 and >&2 only point one stream at another.
  if ((op === '>&' || op === '<&') && /^(\d+|-)$/.test(target)) return false
  return target !== '/dev/null'
}

function riskyPart({ words, redirects }: Simple, ctx: Ctx): boolean {
  if (redirects.some((r) => redirectRisky(r, ctx))) return true
  const rest = [...words]
  for (let m = ASSIGNMENT.exec(rest[0] ?? ''); m; m = ASSIGNMENT.exec(rest[0] ?? '')) {
    if (!SAFE_ENV.has(m[1]) || outsideOrSecret(m[2], ctx)) return true
    rest.shift()
  }
  const [command, ...args] = rest
  if (command === undefined || args.some((a) => outsideOrSecret(a, ctx))) return true
  const rule = ruleFor(command)
  return rule === undefined || rule(args, ctx)
}

/**
 * Whether Auto mode must ask before running this command. It splits the command into the commands it chains and
 * checks every one; anything it can't read with confidence, and any command it doesn't know, is risky.
 *
 * Risky: deleting or overwriting (rm, find -delete, git clean, git reset --hard, git restore, mv or cp onto
 * something that exists, > onto a file), git push and the commands that rewrite history, deploys and rollbacks,
 * installs and package changes (npx of what isn't in the project), network writes (curl with -o or data), sudo,
 * chmod, kill, osascript, open and the like, and anything that reaches outside the project folder (an absolute path
 * outside it, ~, a .. that leaves it, a cd out) or names a secret file.
 *
 * `exists` says whether a path exists (for mv, cp and npx); without it they ask.
 */
export function isRisky(command: string, projectPath: string, exists?: (absolute: string) => boolean): boolean {
  if (!command.trim() || alwaysAsks(command)) return true
  try {
    const ctx: Ctx = { root: path.resolve(projectPath), exists, cd: false }
    return new Splitter(command).run().some((part) => riskyPart(part, ctx))
  } catch {
    return true
  }
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

export interface CommandResult {
  exitCode: number | null
  output: string
  timedOut: boolean
}

/**
 * Run a shell command in a project folder. Apps launched from Finder get a
 * bare PATH, so a login shell plus the usual install locations are added.
 */
export function runCommand(
  command: string,
  cwd: string,
  opts: { timeoutMs?: number; signal?: AbortSignal; onOutput?: (chunk: string) => void } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const home = os.homedir()
    const PATH = [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.volta/bin'), path.join(home, '.bun/bin'), path.join(home, '.local/bin')]
      .filter(Boolean)
      .join(':')
    const shell = existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/sh'
    // Its own process group, so a timeout or cancel can stop what the command started and not just the shell
    // (a bare SIGTERM to the shell leaves e.g. `npm test` running and holding the output pipes open).
    const child = spawn(shell, ['-lc', command], { cwd, env: { ...process.env, PATH, FORCE_COLOR: '0' }, detached: true })
    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, signal)
      } catch {
        child.kill(signal)
      }
    }
    // Anything that ignores SIGTERM gets SIGKILL shortly after, so the pipes always close and the call returns.
    let killTimer: NodeJS.Timeout | undefined
    const stop = () => {
      signalGroup('SIGTERM')
      killTimer ??= setTimeout(() => signalGroup('SIGKILL'), 2_000)
    }
    if (opts.signal?.aborted) stop()
    else opts.signal?.addEventListener('abort', stop, { once: true })

    let output = ''
    const onData = (data: Buffer) => {
      const chunk = data.toString()
      output = (output + chunk).slice(-MAX_OUTPUT)
      opts.onOutput?.(chunk)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, opts.timeoutMs ?? 120_000)

    child.on('error', (err) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      opts.signal?.removeEventListener('abort', stop)
      resolve({ exitCode: null, output: `${output}\n${err.message}`.trim(), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      opts.signal?.removeEventListener('abort', stop)
      resolve({ exitCode: code, output, timedOut })
    })
  })
}
