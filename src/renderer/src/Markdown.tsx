import { useMemo, type ReactNode } from 'react'
import { parseMarkdown, type Inline } from './parse-markdown'

/**
 * While a reply streams in, each word is its own span: it fades in, and a blurred copy of it fades out on top, so it
 * comes into focus without anything else moving. Keys follow each word's place, so words already there stay put.
 */
function Words({ text, path }: { text: string; path: string }) {
  return text.split(/(\s+)/).map((part, i) =>
    !part || /^\s+$/.test(part) ? (
      part
    ) : (
      <span key={`${path}.${i}`} className="w" data-w={part}>
        {part}
      </span>
    ),
  )
}

function Inlines({ nodes, words, path }: { nodes: Inline[]; words: boolean; path: string }) {
  return nodes.map((node, i) => {
    const at = `${path}.${i}`
    switch (node.type) {
      case 'text':
        return words ? <Words key={i} text={node.text} path={at} /> : node.text
      case 'code':
        return <code key={i}>{node.text}</code>
      case 'bold':
        return (
          <strong key={i}>
            <Inlines nodes={node.children} words={words} path={at} />
          </strong>
        )
      case 'italic':
        return (
          <em key={i}>
            <Inlines nodes={node.children} words={words} path={at} />
          </em>
        )
      case 'link':
        // Links open in the default browser.
        return (
          <a key={i} href={node.href} target="_blank" rel="noreferrer">
            <Inlines nodes={node.children} words={words} path={at} />
          </a>
        )
    }
  })
}

/** streaming: new words fade in, with a soft glowing cursor after the last one. */
export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return blocks.map((block, i) => {
    const cursor: ReactNode = streaming && i === blocks.length - 1 ? <span className="cursor" aria-hidden="true" /> : null
    const inline = (nodes: Inline[], path: string) => <Inlines nodes={nodes} words={streaming} path={path} />
    switch (block.type) {
      case 'paragraph':
        return (
          <p key={i}>
            {inline(block.inline, `${i}`)}
            {cursor}
          </p>
        )
      case 'heading':
        return (
          <p key={i} className="md-heading">
            {inline(block.inline, `${i}`)}
            {cursor}
          </p>
        )
      case 'code':
        return (
          <pre key={i}>
            {block.text}
            {cursor}
          </pre>
        )
      case 'list': {
        const List = block.ordered ? 'ol' : 'ul'
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>
                {inline(item, `${i}.${j}`)}
                {j === block.items.length - 1 && cursor}
              </li>
            ))}
          </List>
        )
      }
    }
  })
}
