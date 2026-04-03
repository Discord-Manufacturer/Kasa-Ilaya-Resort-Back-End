import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Package, ArrowRight, PlayCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useAuth } from "@/lib/AuthContext";

export default function HeroSection() {
  const { settings } = useSiteSettings();
  const { isAuthenticated } = useAuth();

  const heroImages = useMemo(() => {
    const images = Array.isArray(settings?.hero_images) ? settings.hero_images.filter(Boolean) : [];

    if (images.length > 0) {
      return images;
    }

    return [settings?.hero_image_url || "img/Logo.png"];
  }, [settings?.hero_images, settings?.hero_image_url]);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const badgeText = settings?.hero_badge_text || "Welcome to Paradise";
  const titleLine1 = settings?.hero_title_line1 || "Kasa Ilaya";
  const titleLine2 = settings?.hero_title_line2 || "Resort & Event Place";
  const heroDescription =
    settings?.hero_description ||
    "Escape to serenity. Experience our premium resort packages with breathtaking views, world-class amenities, and unforgettable moments.";
  const packagesPageUrl = createPageUrl("Packages");
  const loginToPackagesUrl = `${createPageUrl("Login")}?next=${encodeURIComponent(packagesPageUrl)}`;

  const showSliderControls = heroImages.length > 1;

  const goToHeroSlide = (index) => {
    setActiveHeroIndex(index);
  };

  const showPreviousHero = () => {
    setActiveHeroIndex((current) => (current === 0 ? heroImages.length - 1 : current - 1));
  };

  const showNextHero = () => {
    setActiveHeroIndex((current) => (current + 1) % heroImages.length);
  };

  useEffect(() => {
    setActiveHeroIndex(0);
  }, [heroImages.length]);

  useEffect(() => {
    if (heroImages.length < 2) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveHeroIndex((current) => (current + 1) % heroImages.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [heroImages.length]);

  return (
    <section id="top" className="relative flex min-h-[82vh] items-center overflow-hidden sm:min-h-[88vh] lg:min-h-[92vh]">
      {/* Background image */}
      <div className="absolute inset-0">
        <div
          className="flex h-full w-full transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${activeHeroIndex * 100}%)` }}
        >
          {heroImages.map((imageUrl, index) => (
            <img
              key={`${imageUrl}-${index}`}
              src={imageUrl}
              alt={`Resort ${index + 1}`}
              className="h-full w-full flex-none object-cover"
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-transparent" />

        {showSliderControls ? (
          <>
            <button
              type="button"
              onClick={showPreviousHero}
              className="absolute left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 sm:flex lg:left-4 lg:h-11 lg:w-11"
              aria-label="Show previous homepage image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={showNextHero}
              className="absolute right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 sm:flex lg:right-4 lg:h-11 lg:w-11"
              aria-label="Show next homepage image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-full border border-white/15 bg-black/30 px-2.5 py-1.5 backdrop-blur-sm sm:bottom-6 sm:gap-2 sm:px-3 sm:py-2">
              {heroImages.map((_, index) => (
                <button
                  key={`hero-dot-${index}`}
                  type="button"
                  onClick={() => goToHeroSlide(index)}
                  className={`h-2.5 rounded-full transition-all ${index === activeHeroIndex ? "w-8 bg-secondary" : "w-2.5 bg-white/55 hover:bg-white/80"}`}
                  aria-label={`Show homepage image ${index + 1}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-3xl"
        >
          <span className="mb-6 inline-block rounded-full border border-secondary/30 bg-secondary/20 px-4 py-2 text-xs font-medium text-secondary backdrop-blur-sm sm:mb-8 sm:px-5 sm:text-sm">
            {badgeText}
          </span>
          <h1 className="mb-6 font-display text-3xl font-bold leading-tight text-white sm:mb-8 sm:text-5xl lg:text-7xl">
            {titleLine1}
            <span className="block text-secondary">{titleLine2}</span>
          </h1>
          <p className="mb-8 max-w-2xl text-base leading-7 text-white/80 sm:mb-10 sm:text-lg sm:leading-8 lg:text-xl">
            {heroDescription}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-5">
            <Link to={isAuthenticated ? packagesPageUrl : loginToPackagesUrl} className="w-full sm:w-auto">
              <Button size="lg" className="w-full gap-2 bg-primary px-6 text-primary-foreground hover:bg-primary/90 sm:w-auto sm:px-7">
                <Package className="h-5 w-5" />
                View Packages
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to={isAuthenticated ? packagesPageUrl : loginToPackagesUrl} className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2 border-white/40 bg-black/35 px-6 text-white hover:bg-black/50 sm:w-auto sm:px-7"
              >
                <CalendarCheck className="h-5 w-5" />
                Book Now
              </Button>
            </Link>
            <a href="#video-presentation" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full gap-2 border-white/30 bg-white/10 px-6 text-white hover:bg-white/15 sm:w-auto sm:px-7">
                <PlayCircle className="h-5 w-5" />
                Watch Video
              </Button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}