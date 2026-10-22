import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditorView } from '@codemirror/view';
import { QueryEditorComponent } from './query-editor.component';

describe('QueryEditorComponent', () => {
  let fixture: ComponentFixture<QueryEditorComponent>;

  /**
   * Runs change detection and waits until the lazily loaded editor is ready.
   */
  async function render(): Promise<HTMLElement> {
    fixture.detectChanges();
    await fixture.componentInstance.whenReady();
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('[contenteditable="true"]') as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueryEditorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(QueryEditorComponent);
  });

  it('creates an accessible CodeMirror editor with the supplied value', async () => {
    fixture.componentRef.setInput('value', 'Heartbeat | take 10');
    fixture.componentRef.setInput('editorId', 'kql-query');
    fixture.componentRef.setInput('ariaLabel', 'KQL query');

    const content = await render();

    expect(content.id).toBe('kql-query');
    expect(content.getAttribute('aria-label')).toBe('KQL query');
    expect(content.getAttribute('aria-multiline')).toBe('true');
    expect(content.textContent).toContain('Heartbeat | take 10');
  });

  it('shows a placeholder until the editor has been loaded', async () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading editor');

    await render();

    expect(fixture.nativeElement.textContent).not.toContain('Loading editor');
  });

  it('uses values, extensions and focus requested before the editor was loaded', async () => {
    const extensions = jasmine.createSpy('extensions').and.resolveTo([
      EditorView.editorAttributes.of({ class: 'custom-extension' })
    ]);
    fixture.componentRef.setInput('extensions', extensions);
    fixture.componentRef.setInput('value', 'Heartbeat');
    fixture.detectChanges();
    fixture.componentRef.setInput('value', 'AzureActivity');
    fixture.componentInstance.focus();

    const content = await render();

    expect(content.textContent).toBe('AzureActivity');
    expect(extensions).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.cm-editor.custom-extension')).not.toBeNull();
    expect(document.activeElement).toBe(content);
  });

  it('updates the editor when its value changes externally', async () => {
    fixture.componentRef.setInput('value', 'Heartbeat');
    await render();
    fixture.componentRef.setInput('value', 'AzureActivity | take 5');
    fixture.detectChanges();

    const content = fixture.nativeElement.querySelector(
      '[contenteditable="true"]'
    ) as HTMLElement;

    expect(content.textContent).toContain('AzureActivity | take 5');
    expect(content.textContent).not.toContain('Heartbeat');
  });

  it('emits the editor text when it is changed by the user', async () => {
    await render();
    const element = fixture.nativeElement.querySelector('.cm-editor') as HTMLElement;
    const view = EditorView.findFromDOM(element)!;
    const input = jasmine.createSpy('valueChange');
    fixture.componentInstance.valueChange.subscribe(input);

    view.dispatch({
      changes: {
        from: 0,
        insert: 'Heartbeat | take 10'
      }
    });

    expect(input).toHaveBeenCalledWith('Heartbeat | take 10');
  });

  it('destroys the CodeMirror editor with its component', async () => {
    await render();
    const editor = fixture.nativeElement.querySelector('.cm-editor');

    expect(editor).not.toBeNull();

    fixture.destroy();

    expect(editor.isConnected).toBeFalse();
  });
});
