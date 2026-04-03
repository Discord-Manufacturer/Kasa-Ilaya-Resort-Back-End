import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { baseClient } from "@/api/baseClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MapPin, Package } from "lucide-react";

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%2394a3b8'%3ENo Image%3C/text%3E%3C/svg%3E";

export default function FoundItemsGallery() {
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["public-amenities"],
    queryFn: () => baseClient.entities.FoundItem.filter({ is_active: true }, "-date_found", 300),
  });

  const locations = useMemo(() => {
    const unique = [...new Set(items.map((i) => i.location_found).filter(Boolean))];
    return unique.sort();
  }, [items]);

  const displayed = useMemo(() => {
    let filtered = [...items];

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.item_name?.toLowerCase().includes(q) ||
          item.location_found?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q)
      );
    }

    if (locationFilter !== "all") {
      filtered = filtered.filter((item) => item.location_found === locationFilter);
    }

    if (sortBy === "newest") {
      filtered.sort((a, b) => new Date(b.date_found || 0) - new Date(a.date_found || 0));
    } else if (sortBy === "oldest") {
      filtered.sort((a, b) => new Date(a.date_found || 0) - new Date(b.date_found || 0));
    } else if (sortBy === "name") {
      filtered.sort((a, b) => (a.item_name || "").localeCompare(b.item_name || ""));
    }

    return filtered;
  }, [items, search, locationFilter, sortBy]);

  return (
    <section className="bg-gradient-to-b from-muted/30 to-background py-24 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">

        {/* Header */}
        <div className="mb-10">
          <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">
            Resort Amenities
          </Badge>
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Resort Amenities
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground leading-8">
            Explore the amenities and facilities available at Kasa-Ilaya Resort.
          </p>
        </div>

        {/* Filters bar */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-44 bg-background">
              <SelectValue placeholder="All Areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="w-52 bg-background"
            placeholder="Search amenities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <Select value={sortBy} onValueChange={setSortBy} className="ml-auto">
            <SelectTrigger className="w-40 bg-background ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Recently Added</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Gallery grid */}
        {isLoading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-20 text-center text-muted-foreground">
            <Package className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-base">No amenities found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayed.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ItemCard({ item }) {
  const [imgError, setImgError] = useState(false);
  const imageSrc = item.image_url && !imgError ? item.image_url : PLACEHOLDER;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
      {/* Image */}
      <div className="relative aspect-video overflow-hidden bg-muted">
        <img
          src={imageSrc}
          alt={item.item_name || "Amenity"}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setImgError(true)}
        />
        {/* Availability badge */}
        <span
          className={`absolute top-2.5 right-2.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow ${
            item.status !== "claimed"
              ? "bg-green-500/90 text-white"
              : "bg-red-500/90 text-white"
          }`}
        >
          {item.status !== "claimed" ? "Available" : "Unavailable"}
        </span>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="font-semibold text-sm text-foreground leading-snug line-clamp-1">
          {item.item_name || "Amenity"}
        </p>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
            {item.description}
          </p>
        )}
        {item.location_found && (
          <p className="mt-auto flex items-center gap-1 pt-2 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0 text-primary/60" />
            {item.location_found}
          </p>
        )}
      </div>
    </div>
  );
}
