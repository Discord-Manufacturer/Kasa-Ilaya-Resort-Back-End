import React from "react";
import { motion } from "framer-motion";
import { useSiteSettings, AMENITY_ICON_OPTIONS } from "@/hooks/useSiteSettings";

export default function FeaturesSection({ hideHeader = false }) {
  const { settings } = useSiteSettings();
  const {
    amenities_section_label,
    amenities_section_title,
    amenities_section_description,
    amenities,
  } = settings;

  return (
    <section className="bg-card py-24 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        {!hideHeader ? (
          <div className="mb-16 text-center lg:mb-20">
            <span className="text-secondary font-medium text-sm tracking-wider uppercase">{amenities_section_label}</span>
            <h2 className="mt-3 font-display text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl">
              {amenities_section_title}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-muted-foreground leading-8">
              {amenities_section_description}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
          {amenities.map((item, i) => {
            const iconOption = AMENITY_ICON_OPTIONS[item.icon] || AMENITY_ICON_OPTIONS.star;
            const IconComponent = iconOption.Component;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="group rounded-2xl border border-border bg-background p-8 hover:border-primary/20 hover:shadow-lg transition-all duration-300"
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <IconComponent className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm leading-7 text-muted-foreground">{item.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}