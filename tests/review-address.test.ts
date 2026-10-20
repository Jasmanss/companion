import { describe, expect, it } from 'vitest'
import { addressLabel, isLoopbackUrl, parseAppAddress, reviewNote } from '../src/shared/review'

const ok = (input: string) => {
  const r = parseAppAddress(input)
  return r.ok ? r.url : `refused: ${r.reason}`
}

describe('parseAppAddress', () => {
  it('accepts localhost, 127.0.0.1 and [::1], with or without a scheme', () => {
    expect(ok('localhost:3000')).toBe('http://localhost:3000')
    expect(ok('http://localhost:3000')).toBe('http://localhost:3000')
    expect(ok('127.0.0.1:5173')).toBe('http://127.0.0.1:5173')
    expect(ok('http://[::1]:8080')).toBe('http://[::1]:8080')
    expect(ok('https://localhost:5173')).toBe('https://localhost:5173')
    expect(ok('LOCALHOST:3000')).toBe('http://localhost:3000')
  })

  it('keeps a path and a query, drops a fragment and a trailing root slash', () => {
    expect(ok('localhost:3000/pricing')).toBe('http://localhost:3000/pricing')
    expect(ok('localhost:3000/docs?lang=en#top')).toBe('http://localhost:3000/docs?lang=en')
    expect(ok('localhost:3000/')).toBe('http://localhost:3000')
    expect(ok('  localhost:3000  ')).toBe('http://localhost:3000')
  })

  it('refuses every other host, including the ones that merely look like this Mac', () => {
    for (const bad of [
      'https://example.com',
      'example.com:3000',
      'http://localhost.evil.com',
      'http://127.0.0.1.nip.io',
      'http://evil.com@localhost:3000/..', // the host is localhost here, but that is a login in the address
      'http://localhost:3000@evil.com',
      'http://192.168.1.20:3000',
      'http://0.0.0.0:3000',
      'http://[::ffff:8.8.8.8]',
    ]) {
      expect(ok(bad), bad).toMatch(/^refused/)
    }
  })

  it('refuses logins, other schemes, empty and absurd input', () => {
    for (const bad of ['http://user:pass@localhost:3000', 'file:///etc/passwd', 'javascript:alert(1)', 'ftp://localhost', '', '   ', 'http://', 'a'.repeat(400)]) {
      expect(ok(bad), bad).toMatch(/^refused/)
    }
  })
})

describe('isLoopbackUrl: what a captured page may navigate to, and what a hook may never supply', () => {
  it('lets the page stay on this Mac', () => {
    expect(isLoopbackUrl('http://localhost:3000/login')).toBe(true)
    expect(isLoopbackUrl('https://127.0.0.1:3443/')).toBe(true)
  })

  it('stops a redirect anywhere else', () => {
    expect(isLoopbackUrl('https://accounts.google.com/signin')).toBe(false)
    expect(isLoopbackUrl('http://localhost.evil.com')).toBe(false)
    expect(isLoopbackUrl('file:///etc/passwd')).toBe(false)
    expect(isLoopbackUrl('not a url')).toBe(false)
  })
})

describe('the note "Send it back" copies', () => {
  it('has the user’s words and where the pictures are', () => {
    const note = reviewNote({ project: 'my-site', address: 'http://localhost:3000', note: ' The button should say Start free. ', afterFile: '/data/after.png', beforeFile: '/data/before.png' })
    expect(note).toBe(
      ['Visual Review of my-site (localhost:3000): please change this.', 'The button should say Start free.', 'What I saw: /data/after.png', 'What it looked like before: /data/before.png'].join('\n'),
    )
  })

  it('copes with no words and no before picture', () => {
    const note = reviewNote({ project: 'p', address: 'http://localhost:3000/a', note: '  ', afterFile: '/x/after.png', beforeFile: null })
    expect(note).toBe(['Visual Review of p (localhost:3000/a): please change this.', '(no note)', 'What I saw: /x/after.png'].join('\n'))
    expect(addressLabel('https://localhost:5173')).toBe('https://localhost:5173')
  })
})
