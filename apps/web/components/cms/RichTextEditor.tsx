"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { cn } from "../ui/cn";

function ToolbarButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep focus (and the selection) in the editor while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        active ? "bg-blue-100 text-primary-navy" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />;

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:";
  } catch {
    return false;
  }
}

function Toolbar({ editor, onLink, onImage }: { editor: Editor; onLink: () => void; onImage: () => void }) {
  // Re-render the toolbar only when the active marks/nodes actually change.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const i = "h-4 w-4";
  const chain = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5" role="toolbar" aria-label="Formatting">
      <ToolbarButton label="Heading" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className={i} /></ToolbarButton>
      <ToolbarButton label="Subheading" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className={i} /></ToolbarButton>
      <Divider />
      <ToolbarButton label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}><Bold className={i} /></ToolbarButton>
      <ToolbarButton label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}><Italic className={i} /></ToolbarButton>
      <ToolbarButton label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}><Underline className={i} /></ToolbarButton>
      <ToolbarButton label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough className={i} /></ToolbarButton>
      <ToolbarButton label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()}><Code className={i} /></ToolbarButton>
      <Divider />
      <ToolbarButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}><List className={i} /></ToolbarButton>
      <ToolbarButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className={i} /></ToolbarButton>
      <ToolbarButton label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}><Quote className={i} /></ToolbarButton>
      <ToolbarButton label="Divider" onClick={() => chain().setHorizontalRule().run()}><Minus className={i} /></ToolbarButton>
      <Divider />
      <ToolbarButton label="Link" active={s.link} onClick={onLink}><Link2 className={i} /></ToolbarButton>
      {s.link && <ToolbarButton label="Remove link" onClick={() => chain().extendMarkRange("link").unsetLink().run()}><Unlink className={i} /></ToolbarButton>}
      <ToolbarButton label="Image" onClick={onImage}><ImagePlus className={i} /></ToolbarButton>
      <span className="ml-auto flex">
        <ToolbarButton label="Undo" disabled={!s.canUndo} onClick={() => chain().undo().run()}><Undo2 className={i} /></ToolbarButton>
        <ToolbarButton label="Redo" disabled={!s.canRedo} onClick={() => chain().redo().run()}><Redo2 className={i} /></ToolbarButton>
      </span>
    </div>
  );
}

// WYSIWYG editor producing HTML. The server sanitizes everything it stores,
// so this is a convenience boundary, not a security one.
export function RichTextEditor({ value, onChange, placeholder = "Start writing…" }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const [dialog, setDialog] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const editor = useEditor({
    // Avoid SSR hydration mismatches in the App Router.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ["mailto"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "prose-content tiptap min-h-[240px] px-5 py-4 text-gray-800", "aria-label": "Post content", role: "textbox", "aria-multiline": "true" },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  // Load content that arrives after mount (editing an existing post).
  useEffect(() => {
    if (editor && value && editor.isEmpty && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  function openDialog(kind: "link" | "image") {
    setDialog(kind);
    setUrlError(null);
    setAlt("");
    setUrl(kind === "link" ? ((editor?.getAttributes("link").href as string | undefined) ?? "") : "");
  }

  function apply() {
    if (!editor) return;
    const trimmed = url.trim();
    if (!isSafeUrl(trimmed)) {
      setUrlError("Enter a full URL starting with https://");
      return;
    }
    if (dialog === "link") {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      editor.chain().focus().setImage({ src: trimmed, alt: alt.trim() }).run();
    }
    setDialog(null);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm focus-within:border-primary-navy focus-within:ring-2 focus-within:ring-primary-navy/20">
      {editor ? <Toolbar editor={editor} onLink={() => openDialog("link")} onImage={() => openDialog("image")} /> : <div className="h-11 border-b border-gray-200" />}
      <EditorContent editor={editor} />
      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        size="sm"
        title={dialog === "link" ? "Insert link" : "Insert image"}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" onClick={apply}>
              Insert
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <Field label={dialog === "link" ? "URL" : "Image URL"} htmlFor="rte-url" error={urlError}>
            <Input id="rte-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" data-autofocus invalid={Boolean(urlError)} />
          </Field>
          {dialog === "image" && (
            <Field label="Alt text" htmlFor="rte-alt" hint="Describe the image for screen readers.">
              <Input id="rte-alt" value={alt} onChange={(e) => setAlt(e.target.value)} />
            </Field>
          )}
          <button type="submit" hidden />
        </form>
      </Modal>
    </div>
  );
}
