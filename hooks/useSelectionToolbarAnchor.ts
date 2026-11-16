"use client";

import { useMemo } from "react";
import {
  getSelectionBounds,
  type SelectionUnitBounds,
} from "@/lib/canvasSelection";
import { computeGroupBounds } from "@/lib/groupBounds";
import { useCanvasNodesState } from "@/hooks/useCanvasNodesState";
import { useCanvasStore } from "@/lib/store";

export const TOOLBAR_GAP_PX = 14;

export interface ToolbarWorldAnchor {
  /** World-space center-x of the selection bounds. */
  worldX: number;
  /** World-space top-y of the selection bounds. */
  worldY: number;
}

/** Screen-space position for a world anchor (relative to canvas container). */
export function toolbarScreenPosition(
  anchor: ToolbarWorldAnchor,
  viewport: { x: number; y: number; scale: number },
): { left: number; top: number } {
  return {
    left: viewport.x + anchor.worldX * viewport.scale,
    top: viewport.y + anchor.worldY * viewport.scale - TOOLBAR_GAP_PX,
  };
}

/**
 * World-space AABB of the current selection, or of the active group when
 * nothing is selected. Deliberately does NOT subscribe to the live viewport
 * (which changes every pan/zoom frame) — consumers apply the world→screen
 * conversion imperatively.
 */
export function useSelectionWorldBounds(): SelectionUnitBounds | null {
  const selectedFamilyRootIds = useCanvasStore((s) => s.selectedFamilyRootIds);
  const canvasSelection = useCanvasStore((s) => s.canvasSelection);
  const activeGroupId = useCanvasStore((s) => s.activeGroupId);
  const selectedGroupIds = useCanvasStore((s) => s.selectedGroupIds);
  const groups = useCanvasStore((s) => s.groups);
  const nodesState = useCanvasNodesState();

  const activeGroup = activeGroupId ? groups[activeGroupId] : null;

  return useMemo(() => {
    if (selectedFamilyRootIds.length > 0 || canvasSelection.length > 0) {
      return getSelectionBounds(nodesState, {
        familyRootIds: selectedFamilyRootIds,
        items: canvasSelection,
      });
    }
    // Several chapters picked: the union of their frames.
    if (selectedGroupIds.length > 1) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of selectedGroupIds) {
        const group = groups[id];
        const b = group ? computeGroupBounds(nodesState, group) : null;
        if (!b) continue;
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      }
      if (Number.isFinite(minX)) {
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
    }
    if (activeGroup) {
      return computeGroupBounds(nodesState, activeGroup);
    }
    return null;
  }, [nodesState, selectedFamilyRootIds, canvasSelection, activeGroup, selectedGroupIds, groups]);
}
