import React from "react";
import FullCalendarView from "@/components/admin/FullCalendarView";
import EventItemsManager from "@/components/admin/EventItemsManager";
import { useAuth } from "@/lib/AuthContext";

export default function AdminCalendar() {
  const { user } = useAuth();

  return (
    <div>
      <FullCalendarView />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
        <EventItemsManager user={user} />
      </div>
    </div>
  );
}

