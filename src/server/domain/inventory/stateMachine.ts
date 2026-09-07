import type { InventoryStatus } from "@/lib/db/client";

// Pure lookup table, no I/O (ARCHITECTURE.md §2). A transition not
// listed here is illegal - e.g. SOLD -> AVAILABLE must never happen
// silently (brief §107: "DELIVERED -> PENDING_PAYMENT doit être
// impossible" is the same principle applied to inventory).
const ALLOWED_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  AVAILABLE: ["RESERVED", "INSPECTION", "DAMAGED", "LOST", "DISPOSED"],
  RESERVED: ["AVAILABLE", "SOLD"],
  SOLD: ["RETURNED"],
  RETURNED: ["INSPECTION", "AVAILABLE", "DISPOSED"],
  INSPECTION: ["AVAILABLE", "REPAIR", "DAMAGED", "DISPOSED"],
  REPAIR: ["AVAILABLE", "DAMAGED", "DISPOSED"],
  DAMAGED: ["REPAIR", "DISPOSED"],
  LOST: [],
  DISPOSED: [],
};

export function canTransition(
  from: InventoryStatus,
  to: InventoryStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
