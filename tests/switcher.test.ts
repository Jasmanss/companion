import { describe, expect, it } from 'vitest'
import type { Project } from '../src/shared/types'
import { filterProjects, tildify } from '../src/renderer/src/switcher'

const home = '/Users/me'
const projects: Project[] = ['haven', 'tally', 'bite', 'Portfolio', 'my-app', 'companion', 'imperium', 'shopApp'].map((name) => ({
  name,
  path: name === 'imperium' ? `${home}/Desktop/${name}` : `${home}/Documents/${name}`,
}))

const names = (query: string) => filterProjects(projects, query).map((m) => m.project.name)

describe('filterProjects', () => {
  it('lists every project, in order, with no query', () => {
    expect(names('')).toEqual(projects.map((p) => p.name))
    expect(names('   ')).toEqual(projects.map((p) => p.name))
  })

  it('narrows as you type, ignoring case', () => {
    expect(names('ha')).toEqual(['haven'])
    expect(names('HAV')).toEqual(['haven'])
    expect(names('port')).toEqual(['Portfolio'])
  })

  it('ranks a name that starts with the query, then a word in a name that does, then the query anywhere', () => {
    const list: Project[] = ['happy', 'my-app', 'appkit', 'shopApp'].map((name) => ({ name, path: `/x/${name}` }))
    expect(filterProjects(list, 'app').map((m) => m.project.name)).toEqual(['appkit', 'my-app', 'shopApp', 'happy'])
    expect(names('i')).toEqual(['imperium', 'bite', 'Portfolio', 'companion'])
    expect(names('pa')).toEqual(['companion', 'shopApp'])
  })

  it('matches a folder on the path, below any name match', () => {
    expect(names('desk')).toEqual(['imperium'])
    expect(names('doc').length).toBe(7)
  })

  it('falls back to the letters in order', () => {
    expect(names('hvn')).toEqual(['haven'])
    expect(names('cmpn')).toEqual(['companion'])
  })

  it('finds nothing for a query that matches nothing', () => {
    expect(names('zzz')).toEqual([])
  })

  it('says which parts of the name to underline', () => {
    const hit = (q: string, name: string) => filterProjects(projects, q).find((m) => m.project.name === name)?.hits
    expect(hit('ha', 'haven')).toEqual([[0, 2]])
    expect(hit('app', 'shopApp')).toEqual([[4, 7]])
    expect(hit('hvn', 'haven')).toEqual([[0, 1], [2, 3], [4, 5]])
    expect(hit('desk', 'imperium')).toEqual([])
  })

  it('keeps the list order between equally good matches', () => {
    const twins: Project[] = [
      { name: 'web-b', path: '/x/web-b' },
      { name: 'web-a', path: '/x/web-a' },
    ]
    expect(filterProjects(twins, 'web').map((m) => m.project.name)).toEqual(['web-b', 'web-a'])
  })
})

describe('tildify', () => {
  it('shows paths in the home folder with ~', () => {
    expect(tildify('/Users/me/Documents/haven', home)).toBe('~/Documents/haven')
    expect(tildify('/Users/me', home)).toBe('~')
    expect(tildify('/Users/meg/haven', home)).toBe('/Users/meg/haven')
    expect(tildify('/Volumes/code/haven', home)).toBe('/Volumes/code/haven')
  })
})
