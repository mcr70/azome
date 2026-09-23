import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { NetworkTopology } from '../../services/azure/resource-graph.service';
import { buildNetworkGraph, SubnetNavigation } from './network-graph.model';
import { iconDataUri } from './network-graph-icons';

cytoscape.use(dagre);

@Component({
  selector: 'app-network-graph',
  standalone: true,
  template: `<div class="graph-canvas" #canvas></div>`,
  styleUrl: './network-graph.component.scss'
})
export class NetworkGraphComponent implements OnChanges, OnDestroy {
  @Input() public topologies: NetworkTopology[] = [];
  @Output() public subnetSelected = new EventEmitter<SubnetNavigation>();
  @Output() public resourceSelected = new EventEmitter<string>();

  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLDivElement>;

  private cy: Core | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['topologies']) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.cy?.destroy();
  }

  private render(): void {
    this.cy?.destroy();

    const graph = buildNetworkGraph(this.topologies);
    const elements: ElementDefinition[] = [
      ...graph.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          kind: node.kind,
          groupId: node.groupId,
          icon: iconDataUri(node.kind),
          subnetNavigation: node.subnetNavigation
        }
      })),
      ...graph.edges.map((edge) => ({
        data: { id: edge.id, source: edge.source, target: edge.target, kind: edge.kind }
      }))
    ];

    this.cy = cytoscape({
      container: this.canvasRef.nativeElement,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': 11,
            color: '#172033',
            'text-valign': 'bottom',
            'text-margin-y': 8
          }
        },
        {
          selector: 'node:childless',
          style: {
            shape: 'round-rectangle',
            'background-color': '#ffffff',
            'background-image': 'data(icon)',
            'background-fit': 'contain',
            'background-clip': 'none',
            width: 40,
            height: 40,
            'border-width': 0
          }
        },
        {
          selector: 'node[kind = "vnet"]',
          // The owning group box already shows this name, so the node's own label would be redundant.
          style: { width: 52, height: 52, 'font-weight': 700, label: '' }
        },
        {
          selector: 'node[kind = "group"]',
          style: {
            shape: 'round-rectangle',
            'background-color': '#f8fafc',
            'background-opacity': 0.6,
            'border-width': 1,
            'border-style': 'dashed',
            'border-color': '#94a3b8',
            label: 'data(label)',
            'text-valign': 'top',
            'text-halign': 'left',
            'text-margin-y': 20,
            'text-margin-x': 14,
            'font-size': 12,
            'font-weight': 700,
            color: '#0f766e',
            // Cytoscape only supports a single uniform "padding" for compound nodes -
            // the earlier per-side padding-* properties are not recognized and were ignored.
            padding: '44px'
          }
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#94a3b8',
            'curve-style': 'taxi',
            'taxi-direction': 'horizontal',
            'taxi-turn': 24,
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#94a3b8',
            'arrow-scale': 0.9
          }
        },
        {
          selector: 'edge[kind = "contains"]',
          style: { 'line-color': '#64748b', 'target-arrow-color': '#64748b' }
        },
        {
          selector: 'edge[kind = "peered-with"]',
          style: {
            'line-color': '#0f766e',
            'target-arrow-color': '#0f766e',
            'line-style': 'dashed',
            'curve-style': 'unbundled-bezier',
            'target-arrow-shape': 'none'
          }
        },
        {
          selector: 'edge[kind = "secured-by"]',
          style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', 'line-style': 'dotted' }
        },
        {
          selector: 'edge[kind = "routed-by"]',
          style: { 'line-color': '#6366f1', 'target-arrow-color': '#6366f1', 'line-style': 'dotted' }
        }
      ]
    });

    this.layoutByVnetGroup();

    // Emit the resourceSelected event when a network security group or route table node is tapped.
    this.cy.on('tap', 'node[kind = "networkSecurityGroup"], node[kind = "routeTable"], node[kind = "vnet"]', (event) => {      const resourceId = event.target.id();
      if (resourceId) {
        this.resourceSelected.emit(resourceId);
      }
    });
  }

  // Each VNet is laid out in isolation and stacked into its own vertical band, so unrelated
  // VNets can never end up sharing a row - at scale that ambiguity is worse than a crowded graph.
  //
  // Steps per VNet:
  //   1. Select the VNet's own nodes (by groupId) and the hierarchical edges between them,
  //      deliberately leaving out "peered-with" edges - those are lateral, not parent/child,
  //      and would otherwise make dagre rank one VNet below the other (see git history).
  //   2. Run a dagre layout on just that subset, so its position is entirely self-contained.
  //   3. Shift the whole subset down by the vertical space used by previous VNets, so bands
  //      never overlap regardless of how dagre placed things internally.
  //   4. Wrap the VNet's nodes in a Cytoscape "compound" node (a visual-only container) so the
  //      ownership boundary stays obvious even in a larger, denser graph.
  private layoutByVnetGroup(): void {
    if (!this.cy) {
      return;
    }

    const cy = this.cy;
    const vnetNodes = cy.nodes('[kind = "vnet"]').sort((a, b) => (a.data('label') > b.data('label') ? 1 : -1));

    // The group box's uniform padding (see the "group" style rule) adds space on every side,
    // so the gap between two stacked bands must clear the current box's bottom padding
    // plus the next box's top padding, or the boxes visually overlap.
    const groupGap = 130;
    let offsetY = 0;

    vnetNodes.forEach((vnetNode) => {
      const groupId = vnetNode.id();
      const groupNodes = cy.nodes(`[groupId = "${groupId}"]`);
      const groupNodeIds = new Set(groupNodes.map((node) => node.id()));

      // Only keep edges fully contained within this VNet's own nodes.
      const groupEdges = groupNodes.connectedEdges().filter(
        (edge) =>
          edge.data('kind') !== 'peered-with' &&
          groupNodeIds.has(edge.data('source')) &&
          groupNodeIds.has(edge.data('target'))
      );

      // Layout this VNet's subtree in isolation, unaffected by any other VNet.
      groupNodes.union(groupEdges).layout({
        name: 'dagre',
        rankDir: 'LR',
        align: 'UL',
        nodeSep: 40,
        rankSep: 90,
        padding: 40
      } as cytoscape.LayoutOptions).run();

      // Stack this VNet's band below all previously placed VNets.
      const boundingBox = groupNodes.boundingBox();
      const shiftY = offsetY - boundingBox.y1;
      groupNodes.positions((node) => ({ x: node.position('x'), y: node.position('y') + shiftY }));

      // Add a compound "group" node after positioning - it's a pure visual container and
      // does not participate in dagre; Cytoscape auto-sizes its box around its children.
      const containerId = `group:${groupId}`;
      cy.add({ group: 'nodes', data: { id: containerId, label: vnetNode.data('label'), kind: 'group' } });
      groupNodes.forEach((node) => {
        node.move({ parent: containerId });
      });

      offsetY += (boundingBox.y2 - boundingBox.y1) + groupGap;
    });

    // Fit the viewport to the final, fully-positioned graph so it doesn't open over-zoomed.
    cy.fit(undefined, 40);
  }
}
