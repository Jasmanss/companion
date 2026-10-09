import { useMemo } from 'react'
import { parseMarkdown, type Inline } from './parse-markdown'

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.text
      case 'code':
        return <code key={i}>{node.text}</code>
      case 'bold':
        return (
          <strong key={i}>
            <Inlines nodes={node.children} />
          </strong>
        )
      case 'italic':
        return (
          <em key={i}>
            <Inlines nodes={node.children} />
          </em>
        )
      case 'link':
        // Links open in the default browser.
        return (
          <a key={i} href={node.href} target="_blank" rel="noreferrer">
            <Inlines nodes={node.children} />
          </a>
        )
    }
  })
}

export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return blocks.map((block, i) => {
    switch (block.type) {
      case 'paragraph':
        return (
          <p key={i}>
            <Inlines nodes={block.inline} />
          </p>
        )
      case 'heading':
        return (
          <p key={i} className="md-heading">
            <Inlines nodes={block.inline} />
          </p>
        )
      case 'code':
        return <pre key={i}>{block.text}</pre>
      case 'list': {
        const List = block.ordered ? 'ol' : 'ul'
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} />
              </li>
            ))}
          </List>
        )
      }
    }
  })
}
