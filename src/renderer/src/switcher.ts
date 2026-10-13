import type { Project } from '../../shared/types'

export interface ProjectMatch {
  project: Project
  /** The parts of the name that matched, to underline: [start, end) pairs. */
  hits: [number, number][]
}

/** "my-app" or "myApp": does a word of the name start at i? */
function wordStartsAt(name: string, i: number): boolean {
  if (i === 0) return true
  const before = name[i - 1]
  return /[^a-z0-9]/i.test(before) || (/[a-z]/.test(before) && /[A-Z]/.test(name[i]))
}

/** Where the query's letters appear in order in the name ("hvn" in "haven"), merged into runs, or null. */
function lettersInOrder(name: string, query: string): [number, number][] | null {
  const hits: [number, number][] = []
  let from = 0
  for (const ch of query) {
    const at = name.indexOf(ch, from)
    if (at < 0) return null
    const last = hits.at(-1)
    if (last && last[1] === at) last[1] = at + 1
    else hits.push([at, at + 1])
    from = at + 1
  }
  return hits
}

/**
 * Search-as-you-type over the projects, best first: the name starts with the query, then a word in the name does
 * ("app" in "my-app"), then the name has it anywhere, then a folder on the project's path starts with it
 * ("doc" for ~/Documents/…), then the name has its letters in order ("hvn" for haven; three letters or more, as
 * fewer match almost anything). Case doesn't matter, and ties keep the list's order. No query lists every project.
 */
export function filterProjects(projects: Project[], query: string): ProjectMatch[] {
  const q = query.trim().toLowerCase()
  if (!q) return projects.map((project) => ({ project, hits: [] }))
  const scored: { match: ProjectMatch; score: number }[] = []
  for (const project of projects) {
    const name = project.name.toLowerCase()
    let score = 0
    let hits: [number, number][] = []
    const at = name.indexOf(q)
    if (at === 0) score = 5
    else if (at > 0) {
      // Prefer an occurrence at the start of a word.
      let word = -1
      for (let i = at; i >= 0 && word < 0; i = name.indexOf(q, i + 1)) if (wordStartsAt(project.name, i)) word = i
      score = word >= 0 ? 4 : 3
      hits = [[word >= 0 ? word : at, (word >= 0 ? word : at) + q.length]]
    } else if (q.length > 1 && project.path.toLowerCase().split('/').some((folder) => folder.startsWith(q))) score = 2
    else if (q.length > 2) {
      const letters = lettersInOrder(name, q)
      if (letters) {
        score = 1
        hits = letters
      }
    }
    if (at === 0) hits = [[0, q.length]]
    if (score) scored.push({ match: { project, hits }, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.match)
}

/** "/Users/me/Documents/haven" -> "~/Documents/haven" */
export function tildify(folder: string, home: string): string {
  if (!home) return folder
  if (folder === home) return '~'
  return folder.startsWith(`${home}/`) ? `~${folder.slice(home.length)}` : folder
}
