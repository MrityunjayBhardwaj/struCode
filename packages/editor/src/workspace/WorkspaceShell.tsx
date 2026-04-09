/**
 * WorkspaceShell — Phase 10.2 Task 04.
 *
 * Generic tab/group/split container. Holds any tab kind (editor or
 * preview), supports drag-drop between groups for either kind, and
 * dispatches rendering by `tab.kind` without knowing the file type. Owns
 * nothing about engines, runtime state, or keyboard shortcuts — those are
 * injected by Task 05 (`runtimeProviders` + `chromeForTab`), resolved by
 * Task 06 (`previewProviderFor`), and added by Task 08 (Cmd+K V/B/W
 * window listeners).
 *
 * @remarks
 * ## Relationship to the legacy `EditorGroup.tsx`
 *
 * The old `packages/editor/src/visualizers/editor/EditorGroup.tsx` bundled
 * tab bar + Monaco + preview layout with four rendering modes (panel,
 * inline, background, popout) encoded as a single state field on the
 * group. This file replaces the tab bar / group chrome / drag-drop logic
 * with a **lifted** implementation — not an import, not a delegation.
 * The old group stays on disk until Task 09 deletes it; until then it
 * owns zero dependencies on this shell, and this shell owns zero
 * dependencies on it. Lifting (rather than delegating) is the
 * non-negotiable constraint because the old group's rendering-mode field
 * is exactly what Phase 10.2 exists to dissolve — importing from it
 * would pull that field back in through the type system.
 *
 * The PV7 acceptance test in `WorkspaceShell.test.tsx` greps this file's
 * source for the legacy mode-field identifier and fails if any occurrence
 * is found. The string stays out of this file intentionally.
 *
 * ## Group state shape
 *
 * The shell owns a `Map<groupId, WorkspaceGroupState>` plus an ordered
 * `groupOrder: string[]` that records the left-to-right layout. Using a
 * Map (rather than an object keyed by id) is a deliberate choice: it
 * makes the ordering explicit via `groupOrder`, keeps lookups O(1) on
 * group id, and prevents the "key collision with builtin prototype"
 * class of bugs that plain-object stores suffer. The two fields are
 * always updated together inside a single `setGroups`/`setGroupOrder`
 * transaction so they can't desync.
 *
 * ## Tab dispatch (PV7)
 *
 * Inside `renderGroup()`, the active tab is looked up and dispatched on
 * `tab.kind` via an exhaustiveness-checked `switch`:
 *
 *   - `'editor'` → `<EditorView .../>`
 *   - `'preview'` → `<PreviewView .../>`
 *   - default → `assertNever(tab)` — a `never`-typed call that makes
 *     TypeScript fail the compile if a new tab kind is added without
 *     a branch here.
 *
 * The `chromeSlot` for the editor comes from `props.chromeForTab?.(tab)`
 * — Task 05 wires it to runtime chrome via the runtime provider registry.
 * Task 04 calls the callback if supplied and passes `undefined` otherwise
 * (viz / markdown editors have no chrome).
 *
 * ## Drag-drop logic (lifted from EditorGroup, sanitized for PV7)
 *
 * HTML5 drag-drop with a custom MIME type `application/workspace-tab`.
 * Payload is `{ sourceGroupId, tabId }` JSON-encoded into the dataTransfer.
 * On drop, the shell:
 *
 *   1. Reads the payload from `dataTransfer.getData`.
 *   2. Finds the source group + tab.
 *   3. Removes the tab from the source group.
 *   4. Appends the tab to the target group's tab list.
 *   5. Marks the target group's active tab = the dropped tab.
 *   6. Fires `onActiveTabChange` if the active tab changed.
 *
 * The source group may become empty after the drop — that's legal. The
 * shell does not auto-collapse empty groups (the user might be about to
 * drop something else into it); the explicit "close group" button handles
 * removal.
 *
 * ## Group split
 *
 * `splitGroup(groupId)` inserts a new empty group immediately after the
 * given group in `groupOrder`. The new group has a freshly generated id
 * and no tabs. `SplitPane`'s size reconciliation handles the new pane
 * sizing.
 *
 * ## Close group
 *
 * `closeGroup(groupId)` merges the closing group's tabs into the next
 * adjacent group (previous if this is the last one). If the shell has
 * only one group, close-group is disabled (the user must close individual
 * tabs instead). The merged tabs append to the neighbor's tab list and
 * the active tab in the neighbor stays unchanged.
 *
 * ## Active tab tracking
 *
 * Each group has its own `activeTabId`. The shell also tracks a single
 * `activeGroupId` — the group the user last interacted with — so that
 * `getActiveTab()` can return the one "shell-wide active tab." Clicking
 * a tab in a different group updates both `activeGroupId` and the group's
 * `activeTabId`; `onActiveTabChange` fires with the resolved tab.
 *
 * ## Theme ownership (PV6 / PK6)
 *
 * `applyTheme(shellRootRef.current, theme)` runs in a `useEffect` keyed
 * on `[theme]`. This is belt-and-suspenders: child `EditorView` /
 * `PreviewView` roots also apply their own theme, so the shell chrome
 * (tab bars, group dividers, split handles) has a themed ancestor even
 * when child views mount late.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { SplitPane } from '../visualizers/editor/SplitPane'
import { applyTheme } from '../theme/tokens'
import { EditorView } from './EditorView'
import { PreviewView } from './PreviewView'
import { useKeyboardCommands } from './commands/useKeyboardCommands'
import { getPreviewProviderForLanguage } from './preview/registry'
import type { WorkspaceShellActions } from './commands/CommandRegistry'
import type {
  WorkspaceGroupState,
  WorkspaceShellProps,
  WorkspaceTab,
} from './types'

/**
 * Exhaustiveness helper used inside the tab dispatch switch. If TypeScript
 * ever sees a new `WorkspaceTab` variant without a branch added above the
 * default case, this call fails the type-check at compile time.
 */
function assertNever(value: never): never {
  throw new Error(
    `WorkspaceShell: unhandled tab kind in dispatch: ${JSON.stringify(value)}`,
  )
}

/**
 * Stable-ish id generator for newly created groups. Uses a module-level
 * counter plus `Math.random()` — good enough for in-memory shell state
 * that never crosses process boundaries. If we ever need deterministic
 * ids for snapshot testing, inject a factory via props.
 */
let __nextGroupSeq = 0
function generateGroupId(): string {
  __nextGroupSeq += 1
  return `group-${__nextGroupSeq}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * MIME type for the HTML5 drag-drop payload. Distinct from the legacy
 * `'application/viz-tab'` type so drag-drops between the shell and the
 * legacy `EditorGroup` (during the transition period) don't cross wires.
 */
const DRAG_MIME = 'application/workspace-tab'

interface DragPayload {
  readonly sourceGroupId: string
  readonly tabId: string
}

/**
 * Create the initial group state from seed tabs. Always produces exactly
 * one group; later splits / drag-drops may create more. The first seed
 * tab becomes the active tab.
 */
function createInitialGroupState(
  initialTabs: readonly WorkspaceTab[],
): {
  groups: Map<string, WorkspaceGroupState>
  groupOrder: string[]
  activeGroupId: string
} {
  const id = generateGroupId()
  const group: WorkspaceGroupState = {
    id,
    tabs: initialTabs,
    activeTabId: initialTabs.length > 0 ? initialTabs[0].id : null,
  }
  const groups = new Map<string, WorkspaceGroupState>()
  groups.set(id, group)
  return { groups, groupOrder: [id], activeGroupId: id }
}

export function WorkspaceShell({
  initialTabs = [],
  theme = 'dark',
  height = '100%',
  onActiveTabChange,
  onTabClose,
  previewProviderFor,
  chromeForTab,
}: WorkspaceShellProps): React.ReactElement {
  const shellRootRef = useRef<HTMLDivElement>(null)

  // One-shot seeding — `initialTabs` is read exactly once on mount. This
  // mirrors React's uncontrolled-input pattern: the prop is an initial
  // value, not a source of truth. Re-renders with a new `initialTabs`
  // reference do NOT re-seed the shell.
  const initialState = useRef(createInitialGroupState(initialTabs))
  const [groups, setGroups] = useState<Map<string, WorkspaceGroupState>>(
    () => initialState.current.groups,
  )
  const [groupOrder, setGroupOrder] = useState<string[]>(
    () => initialState.current.groupOrder,
  )
  const [activeGroupId, setActiveGroupId] = useState<string>(
    () => initialState.current.activeGroupId,
  )

  // Tracks whether the drag-over highlight should be drawn on a given
  // group. Keyed by group id so multiple groups with concurrent drag
  // events (rapid mouse movement) render correctly.
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)

  // Theme application — PV6 / PK6. Effect, not render.
  useEffect(() => {
    if (!shellRootRef.current) return
    applyTheme(shellRootRef.current, theme)
  }, [theme])

  // Resolve the current shell-wide active tab from the group map.
  // Memoized on the [groups, activeGroupId] dep set so the identity
  // reference is stable until something actually changes.
  const activeTab: WorkspaceTab | null = useMemo(() => {
    const group = groups.get(activeGroupId)
    if (!group || group.activeTabId === null) return null
    return group.tabs.find((t) => t.id === group.activeTabId) ?? null
  }, [groups, activeGroupId])

  // Fire `onActiveTabChange` whenever the resolved active tab changes.
  // Identity comparison on the tab reference is the signal — it changes
  // on tab-level activation AND on active-group switches. Also fires
  // once on mount so subscribers see the initial state.
  const prevActiveTabRef = useRef<WorkspaceTab | null | undefined>(undefined)
  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      prevActiveTabRef.current = activeTab
      onActiveTabChange?.(activeTab)
    }
  }, [activeTab, onActiveTabChange])

  /**
   * Immutable group-state update helper. Takes the current groups map
   * and a patch function; returns a NEW map with the patched group.
   * Leaves the rest of the map alone, so React's referential update
   * semantics work correctly.
   */
  const updateGroup = useCallback(
    (
      groupId: string,
      patch: (g: WorkspaceGroupState) => WorkspaceGroupState,
    ) => {
      setGroups((prev) => {
        const existing = prev.get(groupId)
        if (!existing) return prev
        const next = new Map(prev)
        next.set(groupId, patch(existing))
        return next
      })
    },
    [],
  )

  /**
   * Activate a given tab inside a given group. Updates both the group's
   * local `activeTabId` and the shell-wide `activeGroupId` so the
   * resolved active tab reflects the click.
   */
  const handleTabClick = useCallback(
    (groupId: string, tabId: string) => {
      updateGroup(groupId, (g) => ({ ...g, activeTabId: tabId }))
      setActiveGroupId(groupId)
    },
    [updateGroup],
  )

  /**
   * Close a tab from a group. If the closed tab was active, switches
   * the active tab to the next adjacent tab (preferring the one to the
   * right of the closed position; falling back to the one to the left;
   * null if none remain).
   */
  const handleTabClose = useCallback(
    (groupId: string, tabId: string) => {
      let closedTab: WorkspaceTab | null = null
      setGroups((prev) => {
        const existing = prev.get(groupId)
        if (!existing) return prev
        const idx = existing.tabs.findIndex((t) => t.id === tabId)
        if (idx === -1) return prev
        closedTab = existing.tabs[idx]
        const nextTabs = existing.tabs.filter((t) => t.id !== tabId)
        let nextActive: string | null = existing.activeTabId
        if (existing.activeTabId === tabId) {
          if (nextTabs.length === 0) {
            nextActive = null
          } else if (idx < nextTabs.length) {
            nextActive = nextTabs[idx].id
          } else {
            nextActive = nextTabs[nextTabs.length - 1].id
          }
        }
        const next = new Map(prev)
        next.set(groupId, {
          ...existing,
          tabs: nextTabs,
          activeTabId: nextActive,
        })
        return next
      })
      if (closedTab) {
        onTabClose?.(closedTab)
      }
    },
    [onTabClose],
  )

  /**
   * Split a group horizontally — insert a new empty group immediately
   * after the given group in the layout order. Focus stays on the
   * original group; the new group becomes available as a drop target.
   */
  const handleSplit = useCallback((groupId: string) => {
    const newId = generateGroupId()
    setGroups((prev) => {
      const next = new Map(prev)
      next.set(newId, { id: newId, tabs: [], activeTabId: null })
      return next
    })
    setGroupOrder((prev) => {
      const idx = prev.indexOf(groupId)
      if (idx === -1) return [...prev, newId]
      return [...prev.slice(0, idx + 1), newId, ...prev.slice(idx + 1)]
    })
  }, [])

  /**
   * Close a group. Merges the closing group's tabs into the next adjacent
   * group (right neighbor first, else left). No-op when only one group
   * exists — the shell must always have at least one group.
   */
  const handleCloseGroup = useCallback(
    (groupId: string) => {
      if (groupOrder.length <= 1) return
      const idx = groupOrder.indexOf(groupId)
      if (idx === -1) return
      const neighborId =
        idx + 1 < groupOrder.length ? groupOrder[idx + 1] : groupOrder[idx - 1]

      let movedTabs: readonly WorkspaceTab[] = []
      setGroups((prev) => {
        const closing = prev.get(groupId)
        const neighbor = prev.get(neighborId)
        if (!closing || !neighbor) return prev
        movedTabs = closing.tabs
        const mergedTabs = [...neighbor.tabs, ...closing.tabs]
        const mergedActive =
          neighbor.activeTabId ??
          (mergedTabs.length > 0 ? mergedTabs[0].id : null)
        const next = new Map(prev)
        next.delete(groupId)
        next.set(neighborId, {
          ...neighbor,
          tabs: mergedTabs,
          activeTabId: mergedActive,
        })
        return next
      })
      setGroupOrder((prev) => prev.filter((g) => g !== groupId))
      if (activeGroupId === groupId) {
        setActiveGroupId(neighborId)
      }
      // Swallow `movedTabs` — it's declared for clarity and as a future
      // hook if we want to emit a per-tab "moved" event. Today's
      // consumers only care about close-tab events, not move events.
      void movedTabs
    },
    [groupOrder, activeGroupId],
  )

  // -------------------------------------------------------------------------
  // Task 08 — Command-system imperative actions
  // -------------------------------------------------------------------------

  /**
   * Create a sibling group to the right of `originGroupId` and insert
   * `newTab` as its sole tab. Used by `workspace.openPreviewToSide`.
   */
  const splitGroupWithTab = useCallback(
    (originGroupId: string, _direction: 'right', newTab: WorkspaceTab) => {
      const newId = generateGroupId()
      setGroups((prev) => {
        const next = new Map(prev)
        next.set(newId, {
          id: newId,
          tabs: [newTab],
          activeTabId: newTab.id,
        })
        return next
      })
      setGroupOrder((prev) => {
        const idx = prev.indexOf(originGroupId)
        if (idx === -1) return [...prev, newId]
        return [...prev.slice(0, idx + 1), newId, ...prev.slice(idx + 1)]
      })
    },
    [],
  )

  /**
   * Toggle the background decoration on a group. Set `backgroundTabId` to
   * show a preview layer behind the editor, or `null` to hide it.
   */
  const updateGroupBackground = useCallback(
    (groupId: string, backgroundTabId: string | null) => {
      updateGroup(groupId, (g) => ({
        ...g,
        backgroundTabId: backgroundTabId ?? undefined,
      }))
    },
    [updateGroup],
  )

  /**
   * WorkspaceShellActions object for the command system. Stable reference
   * via useMemo since the callbacks themselves are stable (useCallback).
   */
  const shellActions: WorkspaceShellActions = useMemo(
    () => ({
      addTab: (groupId: string, tab: WorkspaceTab) => {
        updateGroup(groupId, (g) => ({
          ...g,
          tabs: [...g.tabs, tab],
          activeTabId: tab.id,
        }))
      },
      splitGroupWithTab,
      updateGroupBackground,
    }),
    [splitGroupWithTab, updateGroupBackground, updateGroup],
  )

  // -------------------------------------------------------------------------
  // Task 08 — Keyboard commands (Cmd+K chord)
  // -------------------------------------------------------------------------

  // Stable getter refs for the keyboard hook. The hook stores these in a
  // ref so the listener always reads current state without re-attachment.
  const getActiveTab = useCallback((): WorkspaceTab | null => activeTab, [activeTab])
  const getActiveGroupId = useCallback((): string | null => activeGroupId, [activeGroupId])
  const getActiveGroup = useCallback((): WorkspaceGroupState | null => {
    return groups.get(activeGroupId) ?? null
  }, [groups, activeGroupId])

  /**
   * Bridge the shell's `previewProviderFor` prop (keyed by tab) with the
   * command system's `getPreviewProvider` (keyed by language). When the
   * prop is supplied (tests inject stubs here), we construct a synthetic
   * preview-tab stub with the active editor's fileId so the prop callback
   * can match on it. Falls back to the module-level registry.
   */
  const getPreviewProviderForCommand = useCallback(
    (language: string) => {
      // Module-level registry first (production path).
      const fromRegistry = getPreviewProviderForLanguage(language)
      if (fromRegistry) return fromRegistry

      // Prop-level fallback (test path): construct a stub preview tab
      // using the current active editor tab's fileId.
      if (previewProviderFor) {
        const currentTab = activeTab
        const fileId = currentTab?.fileId ?? ''
        return previewProviderFor({
          kind: 'preview',
          id: '__cmd-lookup__',
          fileId,
          sourceRef: { kind: 'default' },
        })
      }
      return undefined
    },
    [previewProviderFor, activeTab],
  )

  useKeyboardCommands({
    getActiveTab,
    getActiveGroupId,
    getActiveGroup,
    shellActions,
    getPreviewProvider: getPreviewProviderForCommand,
  })

  /**
   * Drag start handler. Writes the payload into the dataTransfer using
   * the `DRAG_MIME` type. We also stash the tab id on a JSON payload so
   * the drop handler can look up the source group without relying on
   * cross-component state.
   */
  const handleTabDragStart = useCallback(
    (
      e: React.DragEvent<HTMLDivElement>,
      groupId: string,
      tab: WorkspaceTab,
    ) => {
      const payload: DragPayload = { sourceGroupId: groupId, tabId: tab.id }
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
      e.dataTransfer.effectAllowed = 'move'
    },
    [],
  )

  /**
   * Drop handler for a target group. Parses the payload, validates that
   * the source group + tab still exist (they might not if the user
   * closed the tab mid-drag — `setData` happens sync but the drop
   * happens async), and moves the tab to the target.
   */
  const handleDropOnGroup = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetGroupId: string) => {
      e.preventDefault()
      setDragOverGroupId(null)
      const raw = e.dataTransfer.getData(DRAG_MIME)
      if (!raw) return
      let payload: DragPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }
      const { sourceGroupId, tabId } = payload
      if (sourceGroupId === targetGroupId) {
        // Drop on own group — treat as activation instead of move.
        setGroups((prev) => {
          const g = prev.get(targetGroupId)
          if (!g) return prev
          const tab = g.tabs.find((t) => t.id === tabId)
          if (!tab) return prev
          const next = new Map(prev)
          next.set(targetGroupId, { ...g, activeTabId: tabId })
          return next
        })
        setActiveGroupId(targetGroupId)
        return
      }
      setGroups((prev) => {
        const source = prev.get(sourceGroupId)
        const target = prev.get(targetGroupId)
        if (!source || !target) return prev
        const movingTab = source.tabs.find((t) => t.id === tabId)
        if (!movingTab) return prev
        const sourceTabs = source.tabs.filter((t) => t.id !== tabId)
        // If the source group just lost its active tab, pick a neighbor.
        let sourceActive: string | null = source.activeTabId
        if (source.activeTabId === tabId) {
          sourceActive = sourceTabs.length > 0 ? sourceTabs[0].id : null
        }
        const next = new Map(prev)
        next.set(sourceGroupId, {
          ...source,
          tabs: sourceTabs,
          activeTabId: sourceActive,
        })
        next.set(targetGroupId, {
          ...target,
          tabs: [...target.tabs, movingTab],
          activeTabId: tabId,
        })
        return next
      })
      setActiveGroupId(targetGroupId)
    },
    [],
  )

  /**
   * Dispatch a single tab to its view component. Exhaustiveness-checked
   * so a new `WorkspaceTab` kind fails compile if this switch is not
   * updated alongside the type.
   */
  const renderTabContent = useCallback(
    (
      tab: WorkspaceTab,
      groupId: string,
      isActive: boolean,
    ): React.ReactNode => {
      switch (tab.kind) {
        case 'editor': {
          const chromeSlot = chromeForTab?.(tab) ?? undefined
          return (
            <EditorView
              key={tab.id}
              fileId={tab.fileId}
              chromeSlot={chromeSlot}
              theme={theme}
            />
          )
        }
        case 'preview': {
          const provider = previewProviderFor?.(tab)
          if (!provider) {
            return (
              <div
                data-testid={`preview-no-provider-${tab.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--foreground-muted)',
                  fontSize: 12,
                }}
              >
                No preview provider registered for this file type.
              </div>
            )
          }
          return (
            <PreviewView
              key={tab.id}
              fileId={tab.fileId}
              provider={provider}
              sourceRef={tab.sourceRef}
              theme={theme}
              hidden={!isActive}
              onSourceRefChange={(nextRef) => {
                // Update the tab's sourceRef in place. Tab id is stable,
                // so we replace the tab object inside the group while
                // preserving its order.
                updateGroup(groupId, (g) => ({
                  ...g,
                  tabs: g.tabs.map((t) =>
                    t.id === tab.id && t.kind === 'preview'
                      ? { ...t, sourceRef: nextRef }
                      : t,
                  ),
                }))
              }}
            />
          )
        }
        default:
          return assertNever(tab)
      }
    },
    [chromeForTab, previewProviderFor, theme, updateGroup],
  )

  /**
   * Render one group's tab bar + content area. Factored out of the top-
   * level render body so the `SplitPane` children are readable.
   */
  const renderGroup = useCallback(
    (group: WorkspaceGroupState): React.ReactNode => {
      const activeTabObj = group.tabs.find((t) => t.id === group.activeTabId)
      const isShellActiveGroup = activeGroupId === group.id
      const canClose = groupOrder.length > 1
      const isDragOver = dragOverGroupId === group.id

      return (
        <div
          data-workspace-group={group.id}
          data-active-group={isShellActiveGroup ? 'true' : 'false'}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragOverGroupId !== group.id) {
                setDragOverGroupId(group.id)
              }
            }
          }}
          onDragLeave={(e) => {
            // Only clear the highlight when leaving the group's root,
            // not when crossing child boundaries inside it.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDragOverGroupId((id) => (id === group.id ? null : id))
            }
          }}
          onDrop={(e) => handleDropOnGroup(e, group.id)}
          onMouseDown={() => {
            // Clicking anywhere inside a group focuses it without
            // changing the tab selection. Used by `onActiveTabChange`
            // to emit group-switch events when the user clicks into
            // a non-active group's content area.
            if (activeGroupId !== group.id) {
              setActiveGroupId(group.id)
            }
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            background: 'var(--background)',
            outline: isDragOver
              ? '2px solid var(--accent, #75baff)'
              : 'none',
            outlineOffset: -2,
          }}
        >
          {/* Tab bar */}
          <div
            data-workspace-group-tabbar={group.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--surface)',
              borderBottom: '1px solid var(--border)',
              height: 30,
              flexShrink: 0,
              overflow: 'auto',
            }}
          >
            {group.tabs.map((tab) => {
              const isActive = tab.id === group.activeTabId
              return (
                <div
                  key={tab.id}
                  data-workspace-tab={tab.id}
                  data-tab-kind={tab.kind}
                  data-tab-active={isActive ? 'true' : 'false'}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, group.id, tab)}
                  onClick={() => handleTabClick(group.id, tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '0 8px',
                    height: '100%',
                    cursor: 'grab',
                    background: isActive
                      ? 'var(--background)'
                      : 'transparent',
                    borderRight: '1px solid var(--border)',
                    color: isActive
                      ? 'var(--foreground)'
                      : 'var(--foreground-muted)',
                    fontSize: 11,
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 9, opacity: 0.5 }}>
                    {tab.kind === 'editor' ? '\u25A1' : '\u25CE'}
                  </span>
                  <span>{tab.fileId}</span>
                  <button
                    data-testid={`tab-close-${tab.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTabClose(group.id, tab.id)
                    }}
                    style={closeBtnStyle}
                  >
                    {'\u00D7'}
                  </button>
                </div>
              )
            })}
            <div style={{ flex: 1 }} />
            {/* Group actions */}
            <div
              style={{
                display: 'flex',
                gap: 1,
                padding: '0 4px',
                flexShrink: 0,
              }}
            >
              <button
                data-testid={`group-split-${group.id}`}
                onClick={() => handleSplit(group.id)}
                title="Split right"
                style={actionBtnStyle}
              >
                {'\u2502'}
              </button>
              {canClose && (
                <button
                  data-testid={`group-close-${group.id}`}
                  onClick={() => handleCloseGroup(group.id)}
                  title="Close group"
                  style={actionBtnStyle}
                >
                  {'\u00D7'}
                </button>
              )}
            </div>
          </div>

          {/* Content area */}
          <div
            data-workspace-group-content={group.id}
            style={{ flex: 1, minHeight: 0, position: 'relative' }}
          >
            {/* Task 08 — Background decoration (Cmd+K B) */}
            {group.backgroundTabId && activeTabObj?.kind === 'editor' && (() => {
              const bgProvider = previewProviderFor?.({
                kind: 'preview',
                id: group.backgroundTabId!,
                fileId: activeTabObj.fileId,
                sourceRef: { kind: 'default' },
              })
              if (!bgProvider) return null
              return (
                <div
                  data-workspace-background={group.id}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 0,
                    opacity: 0.4,
                    pointerEvents: 'none',
                  }}
                >
                  <PreviewView
                    fileId={activeTabObj.fileId}
                    provider={bgProvider}
                    sourceRef={{ kind: 'default' }}
                    theme={theme}
                    hidden={false}
                    onSourceRefChange={() => {}}
                  />
                </div>
              )
            })()}
            {activeTabObj ? (
              <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
                {renderTabContent(activeTabObj, group.id, isShellActiveGroup)}
              </div>
            ) : (
              <div
                data-testid={`group-empty-${group.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--foreground-muted)',
                  fontSize: 12,
                }}
              >
                Drop a tab here
              </div>
            )}
          </div>
        </div>
      )
    },
    [
      activeGroupId,
      groupOrder.length,
      dragOverGroupId,
      handleDropOnGroup,
      handleTabClick,
      handleTabClose,
      handleTabDragStart,
      handleSplit,
      handleCloseGroup,
      renderTabContent,
    ],
  )

  // Materialize the group array in layout order. Stable as long as
  // `groupOrder` and `groups` stay stable; `SplitPane` handles the
  // resizing on any count change.
  const orderedGroups = useMemo(
    () =>
      groupOrder
        .map((id) => groups.get(id))
        .filter((g): g is WorkspaceGroupState => g !== undefined),
    [groupOrder, groups],
  )

  return (
    <div
      ref={shellRootRef}
      data-workspace-shell="root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height,
        background: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      {orderedGroups.length === 1 ? (
        renderGroup(orderedGroups[0])
      ) : (
        <SplitPane direction="horizontal">
          {orderedGroups.map((g) => (
            <React.Fragment key={g.id}>{renderGroup(g)}</React.Fragment>
          ))}
        </SplitPane>
      )}
    </div>
  )
}

// Shared button styles — duplicated from the legacy EditorGroup's look
// without importing so the shell has zero dependencies on the old file.
const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--foreground-muted)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '0 2px',
  lineHeight: 1,
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--foreground-muted)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '2px 4px',
  lineHeight: 1,
  borderRadius: 2,
}

