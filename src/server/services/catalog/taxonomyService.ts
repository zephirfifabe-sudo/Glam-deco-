// Thin passthrough service - listing reference data has no business
// logic to add yet, but pages/actions still go through the service
// layer rather than the repository directly (ARCHITECTURE.md §2).
export {
  listCategories,
  createCategory,
} from "@/server/repositories/catalog/categoryRepository";
export {
  listEventTypes,
  createEventType,
} from "@/server/repositories/catalog/eventTypeRepository";
