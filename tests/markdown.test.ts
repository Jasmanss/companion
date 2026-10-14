import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from '../src/renderer/src/parse-markdown'

describe('parseInline', () => {
  it('handles bold, code, and links', () => {
    expect(parseInline('I put **rows.com** in `public/` see [docs](https://a.dev/x).')).toEqual([
      { type: 'text', text: 'I put ' },
      { type: 'bold', children: [{ type: 'text', text: 'rows.com' }] },
      { type: 'text', text: ' in ' },
      { type: 'code', text: 'public/' },
      { type: 'text', text: ' see ' },
      { type: 'link', href: 'https://a.dev/x', children: [{ type: 'text', text: 'docs' }] },
      { type: 'text', text: '.' },
    ])
  })

  it('links bare URLs without trailing punctuation', () => {
    expect(parseInline('More at https://onepagelove.com/section/bento-grid.')).toEqual([
      { type: 'text', text: 'More at ' },
      { type: 'link', href: 'https://onepagelove.com/section/bento-grid', children: [{ type: 'text', text: 'https://onepagelove.com/section/bento-grid' }] },
      { type: 'text', text: '.' },
    ])
  })

  it('reads single asterisks as italics but leaves math and half-streamed bold alone', () => {
    expect(parseInline('a *b* c')).toEqual([{ type: 'text', text: 'a ' }, { type: 'italic', children: [{ type: 'text', text: 'b' }] }, { type: 'text', text: ' c' }])
    expect(parseInline('2 * 3 * 4')).toEqual([{ type: 'text', text: '2 * 3 * 4' }])
    expect(parseInline('I put **rows.c')).toEqual([{ type: 'text', text: 'I put **rows.c' }])
  })
})

describe('parseMarkdown', () => {
  it('splits paragraphs and lists, including lists right after a line of text', () => {
    expect(parseMarkdown('Two picks:\n- **Rows**\n- Raycast\n\n1. one\n2. two')).toEqual([
      { type: 'paragraph', inline: [{ type: 'text', text: 'Two picks:' }] },
      { type: 'list', ordered: false, items: [[{ type: 'bold', children: [{ type: 'text', text: 'Rows' }] }], [{ type: 'text', text: 'Raycast' }]] },
      { type: 'list', ordered: true, items: [[{ type: 'text', text: 'one' }], [{ type: 'text', text: 'two' }]] },
    ])
  })

  it('keeps code fences verbatim, even unclosed while streaming', () => {
    expect(parseMarkdown('Run:\n```bash\nnpm test **x**\n```\nDone')).toEqual([
      { type: 'paragraph', inline: [{ type: 'text', text: 'Run:' }] },
      { type: 'code', text: 'npm test **x**' },
      { type: 'paragraph', inline: [{ type: 'text', text: 'Done' }] },
    ])
    expect(parseMarkdown('```\nnpm i')).toEqual([{ type: 'code', text: 'npm i' }])
  })
})
