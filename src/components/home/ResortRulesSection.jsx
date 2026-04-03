import React from "react";
import { ShieldCheck } from "lucide-react";
import { useResortRules } from "@/hooks/useResortRules";

export default function ResortRulesSection() {
  const { rules } = useResortRules();

  return (
    <section className="bg-background py-24 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="mb-16 text-center lg:mb-20">
          <span className="text-secondary font-medium text-sm tracking-wider uppercase">Guest Guide</span>
          <h2 className="mt-3 font-display text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl">
            Resort Rules And Reminders
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-muted-foreground leading-8">
            Please review these important house rules before your visit so every stay at Kasa Ilaya remains safe, orderly, and enjoyable.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3 lg:gap-10">
          {rules.map((rule) => (
            <div key={rule.title} className="rounded-2xl border border-border bg-card p-8 shadow-sm">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-3 text-lg font-semibold text-foreground">{rule.title}</h3>
              <p className="text-sm leading-7 text-muted-foreground">{rule.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}