import type { CSSProperties, ReactNode } from "react";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "hr" }
  | { type: "code"; text: string };

export function MarkdownMessage({ text }: { text: string }) {
  return <div style={rootStyle}>{parseBlocks(text).map(renderBlock)}</div>;
}

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let code: string[] | null = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push({ type: list.type, items: list.items });
    list = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (code) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "hr" });
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(unordered[1]);
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (code) blocks.push({ type: "code", text: code.join("\n") });
  flushParagraph();
  flushList();
  return blocks;
}

function renderBlock(block: Block, index: number): ReactNode {
  if (block.type === "heading") {
    const Tag = (`h${Math.min(block.level + 2, 5)}`) as keyof JSX.IntrinsicElements;
    return (
      <Tag key={index} style={{ ...headingStyle, fontSize: block.level <= 2 ? 16 : 14 }}>
        {renderInline(block.text)}
      </Tag>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p key={index} style={paragraphStyle}>
        {block.lines.map((line, lineIndex) => (
          <span key={lineIndex}>
            {lineIndex > 0 && <br />}
            {renderInline(line)}
          </span>
        ))}
      </p>
    );
  }

  if (block.type === "ul") {
    return (
      <ul key={index} style={listStyle}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex} style={listItemStyle}>
            {renderInline(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "ol") {
    return (
      <ol key={index} style={listStyle}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex} style={listItemStyle}>
            {renderInline(item)}
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === "code") {
    return (
      <pre key={index} style={codeBlockStyle}>
        <code>{block.text}</code>
      </pre>
    );
  }

  return <hr key={index} style={hrStyle} />;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={nodes.length}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={nodes.length} style={inlineCodeStyle}>
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link?.[2] ?? "";
      nodes.push(
        <a
          key={nodes.length}
          href={isSafeHref(href) ? href : undefined}
          target="_blank"
          rel="noreferrer"
          style={linkStyle}
        >
          {link?.[1] ?? token}
        </a>
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

const rootStyle: CSSProperties = {
  color: "var(--ac-text)",
  fontSize: 13,
  lineHeight: 1.55,
  overflowWrap: "anywhere",
};

const headingStyle: CSSProperties = {
  margin: "12px 0 6px",
  color: "var(--ac-text)",
  fontWeight: 900,
  letterSpacing: 0,
  lineHeight: 1.25,
};

const paragraphStyle: CSSProperties = {
  margin: "0 0 9px",
};

const listStyle: CSSProperties = {
  margin: "0 0 10px 18px",
  padding: 0,
};

const listItemStyle: CSSProperties = {
  marginBottom: 4,
  paddingLeft: 3,
};

const linkStyle: CSSProperties = {
  color: "var(--ac-accent-text)",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

const inlineCodeStyle: CSSProperties = {
  borderRadius: 4,
  background: "var(--ac-glass)",
  border: "1px solid var(--ac-border)",
  padding: "1px 4px",
  color: "var(--ac-accent-text)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12,
};

const codeBlockStyle: CSSProperties = {
  margin: "8px 0 12px",
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text-soft)",
  padding: 10,
  overflowX: "auto",
  fontSize: 12,
  lineHeight: 1.45,
};

const hrStyle: CSSProperties = {
  border: "none",
  borderTop: "1px solid var(--ac-border)",
  margin: "12px 0",
};
