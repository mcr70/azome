import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ResourceGroupListComponent } from './resource-group-list.component';

describe('ResourceGroupListComponent', () => {
  let component: ResourceGroupListComponent;
  let fixture: ComponentFixture<ResourceGroupListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, ResourceGroupListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResourceGroupListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
