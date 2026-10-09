/** Just enough Markdown for chat replies: paragraphs, lists, headings, code, bold, italics, links. */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }

export type Block =
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'heading'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; text: string }

const INLINE = new RegExp(
  [
    /`([^`\n]+)`/.source, // 1: code
    /\*\*(?=\S)([^\n]+?)(?<=\S)\*\*/.source, // 2: bold
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/.source, // 3, 4: [label](url)
    /(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*])/.source, // 5: bare url
    /(?<![\w*])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![\w*])/.source, // 6: italic
  ].join('|'),
  'g',
)

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ type: 'code', text: m[1] })
    else if (m[2] !== undefined) out.push({ type: 'bold', children: parseInline(m[2]) })
    else if (m[3] !== undefined) out.push({ type: 'link', href: m[4], children: parseInline(m[3]) })
    else if (m[5] !== undefined) out.push({ type: 'link', href: m[5], children: [{ type: 'text', text: m[5] }] })
    else out.push({ type: 'italic', children: parseInline(m[6]) })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

const LIST_ITEM = /^\s*([-*•]|\d+[.)])\s+(.*)$/
const HEADING = /^#{1,6}\s+(.*)$/

function parseText(text: string, blocks: Block[]): void {
  let paragraph: string[] = []
  // Cast so TypeScript doesn't narrow this to null; the helpers below reassign it.
  let list = null as { ordered: boolean; items: string[] } | null
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join('\n')) })
    paragraph = []
  }
  const closeList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) })
    list = null
  }

  for (const line of text.split('\n')) {
    const item = LIST_ITEM.exec(line)
    const heading = HEADING.exec(line)
    if (!line.trim()) {
      flushParagraph()
      closeList()
    } else if (item) {
      flushParagraph()
      const ordered = /\d/.test(item[1])
      if (list?.ordered !== ordered) {
        closeList()
        list = { ordered, items: [] }
      }
      list!.items.push(item[2])
    } else if (heading) {
      flushParagraph()
      closeList()
      blocks.push({ type: 'heading', inline: parseInline(heading[1]) })
    } else if (list && /^\s{2,}\S/.test(line)) {
      // An indented line continues the previous list item.
      list.items[list.items.length - 1] += ` ${line.trim()}`
    } else {
      closeList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  closeList()
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = []
  // An unclosed fence (mid-stream) runs to the end.
  const fence = /```[^\n]*\n?([\s\S]*?)(?:```|$)/g
  let last = 0
  for (const m of text.matchAll(fence)) {
    parseText(text.slice(last, m.index), blocks)
    blocks.push({ type: 'code', text: m[1].replace(/\n$/, '') })
    last = m.index + m[0].length
  }
  parseText(text.slice(last), blocks)
  return blocks
}
