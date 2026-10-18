import { TestBed } from '@angular/core/testing';
import { StorageAccountComponent } from './storage-account-details.component';

describe('StorageAccountComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StorageAccountComponent]
    }).compileComponents();
  });

  it('keeps encryption service and tag rows when change detection runs again', () => {
    const fixture = TestBed.createComponent(StorageAccountComponent);
    fixture.componentRef.setInput('resource', {
      tags: {
        environment: 'test',
        owner: 'platform'
      },
      properties: {
        encryption: {
          keySource: 'Microsoft.Storage',
          services: {
            blob: {
              enabled: true,
              keyType: 'BLOB'
            },
            file: {
              enabled: true,
              keyType: 'FILE'
            }
          }
        }
      }
    });
    fixture.detectChanges();

    const sections = Array.from(
      fixture.nativeElement.querySelectorAll('section.storage-section')
    ) as HTMLElement[];
    const encryptionSection = sections.find(
      (section) => section.querySelector('h3')?.textContent?.trim() === 'Encryption Services'
    );
    const tagsSection = sections.find(
      (section) => section.querySelector('h3')?.textContent?.trim() === 'Tags'
    );
    const serviceRow = encryptionSection?.querySelector('tbody tr');
    const tagRow = tagsSection?.querySelector('tbody tr');

    expect(serviceRow).toBeTruthy();
    expect(tagRow).toBeTruthy();

    fixture.detectChanges();

    expect(encryptionSection?.querySelector('tbody tr')).toBe(serviceRow);
    expect(tagsSection?.querySelector('tbody tr')).toBe(tagRow);
    expect(serviceRow?.textContent).toContain('BLOB');
    expect(tagRow?.textContent).toContain('environment');
  });
});
