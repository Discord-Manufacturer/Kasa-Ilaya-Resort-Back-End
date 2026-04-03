import React from "react";
import HeroSection from "@/components/home/HeroSection";
import ResortGallerySlider from "@/components/home/ResortGallerySlider";
import VideoPresentationSection from "@/components/home/VideoPresentationSection";
import UpcomingScheduleSection from "@/components/home/UpcomingScheduleSection";
import FeaturesSection from "@/components/home/FeaturesSection";
import ResortRulesSection from "@/components/home/ResortRulesSection";
import ReviewsSection from "@/components/home/ReviewSection.jsx";
import CTASection from "@/components/home/CTASection";

export default function Home() {
  return (
    <div>
      <HeroSection />
      <ResortGallerySlider />
      <VideoPresentationSection />
      <UpcomingScheduleSection allowAdminActions={false} />
      <FeaturesSection />
      <ResortRulesSection />
      <ReviewsSection />
      <CTASection />
    </div>
  );
}