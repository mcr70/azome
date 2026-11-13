# Metrics chart refactor

This document records the agreed implementation direction for extracting
metric chart rendering from Auto-Metrics and Metric Explorer. Use it as
handoff guidance if implementation needs to continue in another session.

## Goals

- Render Auto-Metrics and Metric Explorer charts through one shared chart
  component.
- Use `@swimlane/ngx-charts` for interactive charts with point hover details.
- Let users open a chart in a larger modal using the existing KQL dialog as a
  visual and accessibility reference. If multiple metrics are visible in
  Auto-Metrics or Metric Explorer, let users switch the displayed metric and
  resource inside the modal without changing the underlying query selection.
- Make query parameters such as time range and aggregation changeable and keep
  the chart data synchronized with those choices.
- Keep Azure Monitor requests and query state in the existing metrics view
  components. The shared chart component is responsible for presentation and
  user events, not fetching data.

## Current structure

- `MetricsComponent` owns the shared time range and renders the Auto-Metrics and
  Metric Explorer tabs.
- `AutoMetricsComponent` chooses a small set of default metrics and queries
  those charts for selected resources.
- `MetricExplorerComponent` loads metric definitions, supports selecting
  resources and metrics, and queries them with one aggregation shared by the
  selected metrics.
- Both templates currently duplicate the metric card, latest-value display,
  hand-built bar chart, and time labels.
- `MetricChart` contains the resource, metric name, unit, aggregation, points,
  and optional error. Azure data points provide timestamps and optional
  aggregation values. Use `MetricsSupportService.metricValue` semantics so the
  chart, hover details, and latest value all show the selected aggregation.
- `@swimlane/ngx-charts` is not currently listed in `package.json`. Add it as a
  dependency during implementation after checking compatibility with this
  repository's Angular version and updating the lockfile.

## Shared chart component

Add a focused standalone component in this folder, for example
`metric-chart.component.ts/html/scss`. It should:

- Accept a `MetricChart` and the display/query settings it needs as inputs.
- Convert the metric points into the series shape required by ngx-charts in one
  place. Keep timestamp ordering and selected-aggregation values correct.
- Render loading, error, and empty-data states consistently for both callers.
- Show the metric name, unit, aggregation, and useful latest value.
- Provide hover details with the timestamp and formatted value for the point.
- Support at least bar and line chart styles if both can represent the Azure
  points clearly. Keep the selected chart style local to the chart unless a
  broader persistence decision is made.
- Offer an expand action that opens a larger chart in a native modal dialog,
  following the KQL dialog's close button, backdrop, focus, and Escape behavior.
  The expanded view must reuse the same data conversion and selected settings.
- Emit user changes as outputs. Do not inject `AzureMetricsService` or make
  Azure requests from this component.

Check ngx-charts' Angular compatibility, data interfaces, tooltip support,
responsive sizing, and required browser APIs before wiring it in. Keep the
implementation behind the shared component so the two metric views do not
depend directly on ngx-charts primitives.

## Query parameters and ownership

- Keep the time-range selector in `MetricsComponent`; it already applies to
  both tabs. Changing it should trigger the active view to fetch a new range,
  and inactive tabs should continue to load when activated according to their
  existing lifecycle.
- Keep the Metric Explorer aggregation as a query-level selection shared by
  its selected metrics. Continue offering only aggregations supported by every
  selected definition.
- Add a changeable aggregation for Auto-Metrics charts, limited to the
  aggregation options supported by that chart's definition. When it changes,
  `AutoMetricsComponent` should re-query that metric for the current time range
  and replace only its matching chart result.
- Let the chart component display current query parameters and emit requested
  changes. Its parent applies those changes and decides whether to re-query.
- Cancel or ignore stale requests when time range, aggregation, resources, or
  selected metrics change. Preserve the existing independent resource loading
  and partial-error behavior in Auto-Metrics.

If implementing per-chart aggregation in Metric Explorer is considered, first
revisit its current cross-resource comparison contract. Do not silently change
the shared-aggregation behavior as part of chart extraction.

## Modal behavior

- Use the same chart component for compact cards and the expanded modal, with a
  clear size/display input if needed.
- Keep the modal in the shared chart component unless doing so duplicates
  complex query state. A separate modal host is acceptable if it still renders
  the same chart component and receives the same current metric/settings.
- Include an accessible title based on the resource and metric, an X close
  button, a dimmed backdrop, Escape handling, and a visible close affordance.
- When multiple charts are available, provide a modal selector across the
  current view's visible resource and metric results.
- Ensure closed native dialogs are hidden by CSS; only apply flex layout while
  the dialog is open.

## Suggested implementation order

1. Add and validate the ngx-charts dependency and choose the minimum chart types
   supported by the current `MetricChart` data.
2. Implement the shared chart component and its point/value conversion,
   tooltips, empty/error states, chart-style selector, and expanded modal.
3. Replace the duplicated chart markup in Auto-Metrics with the shared
   component while preserving default metric selection and resource-level
   loading/error behavior.
4. Replace the duplicated chart markup in Metric Explorer while preserving its
   shared aggregation and cross-resource comparison behavior.
5. Add Auto-Metrics aggregation selection and ensure both views refetch when
   their query parameters change.
6. Update relevant component and service specs, then report the exact build/test
   commands run and any environment limitations.

## Completion checks

- Both views use the same chart component; no hand-built metric bars remain in
  their templates.
- Hover exposes the timestamp and formatted value for each point.
- A chart opens larger in a modal and closes with the X button and Escape.
- Time range updates and aggregation selections cause the correct Azure Monitor
  requests and visibly update chart values.
- Metric Explorer still uses an aggregation valid for all its selected
  metrics, and Auto-Metrics retains independent loading and partial failures.
- Error, loading, empty, accessible labels, units, latest values, and chart
  resizing work at both card and expanded sizes.
