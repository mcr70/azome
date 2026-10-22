import { basicSetup } from 'codemirror';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export interface QueryEditorOptions {
  parent: HTMLElement;
  value: string;
  attributes: Record<string, string>;
  onChange: (value: string) => void;
}

/** Thin handle so that the component does not need CodeMirror types or modules eagerly. */
export interface QueryEditorHandle {
  setValue(value: string): void;
  setExtensions(extensions: Extension[]): void;
  setAttributes(attributes: Record<string, string>): void;
  focus(): void;
  destroy(): void;
}

const theme = EditorView.theme({
  '&': {
    border: '1px solid #cbd5e1',
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: '#172033'
  },
  '&.cm-focused': {
    outline: '2px solid #0f766e',
    outlineOffset: '1px'
  },
  '.cm-content': {
    minHeight: '140px',
    padding: '8px 0',
    fontFamily: 'Consolas, monospace'
  },
  '.cm-gutters': {
    minHeight: '140px',
    borderRight: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    color: '#64748b'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'Consolas, monospace'
  }
});

/**
 * Creates a CodeMirror editor. This module is loaded lazily by QueryEditorComponent.
 * @param options Initial value, content attributes and change callback
 */
export function createQueryEditor(options: QueryEditorOptions): QueryEditorHandle {
  const extensionsCompartment = new Compartment();
  const attributesCompartment = new Compartment();

  const view = new EditorView({
    state: EditorState.create({
      doc: options.value,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        extensionsCompartment.of([]),
        attributesCompartment.of(EditorView.contentAttributes.of(options.attributes)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            options.onChange(update.state.doc.toString());
          }
        }),
        theme
      ]
    }),
    parent: options.parent
  });

  return {
    setValue(value: string): void {
      if (view.state.doc.toString() !== value) {
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: value
          }
        });
      }
    },
    setExtensions(extensions: Extension[]): void {
      view.dispatch({
        effects: extensionsCompartment.reconfigure(extensions)
      });
    },
    setAttributes(attributes: Record<string, string>): void {
      view.dispatch({
        effects: attributesCompartment.reconfigure(EditorView.contentAttributes.of(attributes))
      });
    },
    focus(): void {
      view.focus();
    },
    destroy(): void {
      view.destroy();
    }
  };
}
