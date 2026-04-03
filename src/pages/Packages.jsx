import React, { useEffect, useMemo, useState } from "react";
import { baseClient } from "@/api/baseClient";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import PackageCard from "@/components/packages/PackageCard";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const MAX_BOOKINGS_PER_SLOT = 1;
const tourTypeOrder = {
  day_tour: 0,
  night_tour: 1,
  "22_hours": 2,
};

const sortPackagesForDisplay = (packages) =>
  [...packages].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name);
    if (nameComparison !== 0) {
      return nameComparison;
    }

    return (tourTypeOrder[left.tour_type] ?? 99) - (tourTypeOrder[right.tour_type] ?? 99);
  });

export default function Packages() {
  const [tourFilter, setTourFilter] = useState("all");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const { settings: siteSettings } = useSiteSettings();
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);

  useEffect(() => {
    baseClient.auth.me()
      .catch(() => {
        baseClient.auth.redirectToLogin(window.location.href);
        return null;
      })
      .finally(() => {
        setIsCheckingAuth(false);
      });
  }, []);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["packages"],
    queryFn: () => baseClient.entities.Package.filter({ is_active: true }, "name"),
  });

  const { data: activeBookings = [] } = useQuery({
    queryKey: ["package-live-availability"],
    queryFn: () => baseClient.entities.Booking.filter({ status: ["pending", "confirmed", "completed"] }),
    refetchInterval: 15000,
  });

  const filtered = sortPackagesForDisplay(packages);
  const packagesBannerImages = useMemo(() => {
    const images = Array.isArray(siteSettings?.packages_banner_images)
      ? siteSettings.packages_banner_images.filter(Boolean)
      : [];

    if (images.length > 0) {
      return images;
    }

    return [siteSettings?.packages_banner_url || siteSettings?.hero_image_url || "img/Logo.png"];
  }, [siteSettings?.packages_banner_images, siteSettings?.packages_banner_url, siteSettings?.hero_image_url]);
  const showBannerControls = packagesBannerImages.length > 1;

  const goToBannerSlide = (index) => {
    setActiveBannerIndex(index);
  };

  const showPreviousBanner = () => {
    setActiveBannerIndex((current) => (current === 0 ? packagesBannerImages.length - 1 : current - 1));
  };

  const showNextBanner = () => {
    setActiveBannerIndex((current) => (current + 1) % packagesBannerImages.length);
  };

  const today = format(new Date(), "yyyy-MM-dd");
  const liveAvailability = activeBookings.reduce((acc, booking) => {
    if (booking.booking_date !== today || !booking.package_id) {
      return acc;
    }

    acc[booking.package_id] = (acc[booking.package_id] || 0) + 1;
    return acc;
  }, {});

  useEffect(() => {
    setActiveBannerIndex(0);
  }, [packagesBannerImages.length]);

  useEffect(() => {
    if (packagesBannerImages.length < 2) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveBannerIndex((current) => (current + 1) % packagesBannerImages.length);
    }, 4500);

    return () => window.clearInterval(intervalId);
  }, [packagesBannerImages.length]);

  if (isCheckingAuth) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-10">
        <span className="text-secondary font-medium text-sm tracking-wider uppercase">Choose Your Experience</span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-2">Our Packages</h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
          Select from our carefully curated resort experiences and preview pricing by tour type
        </p>
      </div>

      <div className="relative mb-10 h-72 overflow-hidden rounded-3xl border border-primary/15 shadow-sm sm:h-80 lg:h-[26rem] xl:h-[30rem]">
        <div className="absolute inset-0">
          <div
            className="flex h-full w-full transition-transform duration-700 ease-in-out"
            style={{ transform: `translateX(-${activeBannerIndex * 100}%)` }}
          >
            {packagesBannerImages.map((imageUrl, index) => (
              <img
                key={`${imageUrl}-${index}`}
                src={imageUrl}
                alt={`Packages banner ${index + 1}`}
                className="h-full w-full flex-none object-cover"
              />
            ))}
          </div>
          <div className="absolute inset-0 bg-black/15" />
        </div>
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/20 blur-2xl" />
        <div className="absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-secondary/20 blur-2xl" />

        {showBannerControls ? (
          <>
            <button
              type="button"
              onClick={showPreviousBanner}
              className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
              aria-label="Show previous packages banner image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={showNextBanner}
              className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
              aria-label="Show next packages banner image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 backdrop-blur-sm">
              {packagesBannerImages.map((_, index) => (
                <button
                  key={`packages-banner-dot-${index}`}
                  type="button"
                  onClick={() => goToBannerSlide(index)}
                  className={`h-2.5 rounded-full transition-all ${index === activeBannerIndex ? "w-8 bg-secondary" : "w-2.5 bg-white/60 hover:bg-white/85"}`}
                  aria-label={`Show packages banner image ${index + 1}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex justify-center mb-8">
        <Tabs value={tourFilter} onValueChange={setTourFilter}>
          <TabsList className="bg-muted">
            <TabsTrigger value="all">All Packages</TabsTrigger>
            <TabsTrigger value="day_tour">☀️ Day Tour</TabsTrigger>
            <TabsTrigger value="night_tour">🌙 Night Tour</TabsTrigger>
            <TabsTrigger value="22_hours">⏰ 22 Hours</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p>No packages available yet. Check back soon!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((pkg, i) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              index={i}
              selectedTour={tourFilter === 'all' ? '' : tourFilter}
              liveAvailability={{
                bookedToday: liveAvailability[pkg.id] || 0,
                maxSlots: MAX_BOOKINGS_PER_SLOT,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}