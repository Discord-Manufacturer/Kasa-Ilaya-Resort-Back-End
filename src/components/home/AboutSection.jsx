import React from "react";
import { Link } from "react-router-dom";
import { Palmtree, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

const pillars = [
  {
    icon: Palmtree,
    title: "Relaxed Resort Escape",
    description: "Open-air spaces, poolside comfort, and private corners designed for family trips and barkada gatherings.",
  },
  {
    icon: Sparkles,
    title: "Celebrations Made Easy",
    description: "From birthdays to reunions, Kasa Ilaya blends accommodation, venue space, and leisure in one destination.",
  },
  {
    icon: ShieldCheck,
    title: "Guest-First Experience",
    description: "We focus on safe stays, clear booking steps, and responsive support before, during, and after your visit.",
  },
];

export default function AboutSection({ standalone = false }) {
  return (
    <section id={standalone ? undefined : "about-us"} className="relative overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background py-24 sm:py-28 lg:py-32">
      <div className="absolute left-0 top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-secondary/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            About Us
          </div>

          <div className="space-y-4">
            <h2 className="font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl lg:text-5xl">
              A resort experience built for quiet escapes and memorable celebrations.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              Kasa Ilaya Resort & Event Place welcomes guests looking for a comfortable getaway, a flexible event venue,
              and a place where families and friends can slow down together. Our goal is simple: make booking clear,
              stays enjoyable, and gatherings easy to plan.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur-sm">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">What We Offer</p>
            <p className="mt-3 text-lg leading-8 text-foreground/90">
              Resort amenities, private event spaces, overnight and tour packages, and a guest journey designed to feel
              practical, welcoming, and stress-free.
            </p>
          </div>
        </div>

        <div className="grid gap-4 self-start">
          {pillars.map((item) => (
            <div key={item.title} className="rounded-3xl border border-border bg-card p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold text-foreground">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
            </div>
          ))}

          <div className="pt-2">
            <Link to={createPageUrl("Contact")}>
              <Button className="gap-2 rounded-full px-6">
                Contact Us
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
