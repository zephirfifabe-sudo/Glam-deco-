import { listEventTypes } from "@/server/services/catalog/taxonomyService";
import { EventTypeForm } from "./EventTypeForm";

export const metadata = { title: "Admin - Types d'événement" };

export default async function AdminEventTypesPage() {
  const eventTypes = await listEventTypes();

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl">Types d&rsquo;événement</h1>
      <ul className="mb-8 flex flex-col gap-1 text-sm">
        {eventTypes.map((eventType) => (
          <li key={eventType.id} className="text-neutral-700">
            {eventType.name}{" "}
            <span className="text-neutral-400">({eventType.slug})</span>
          </li>
        ))}
      </ul>
      <EventTypeForm />
    </div>
  );
}
