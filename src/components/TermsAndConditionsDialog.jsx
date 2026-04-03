import React from "react";
import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { defaultSiteSettings, useSiteSettings } from "@/hooks/useSiteSettings";

export default function TermsAndConditionsDialog({ trigger }) {
  const { settings } = useSiteSettings();

  const title = settings?.terms_title?.trim() || defaultSiteSettings.terms_title;
  const summary = settings?.terms_summary?.trim() || defaultSiteSettings.terms_summary;
  const content = settings?.terms_content?.trim() || defaultSiteSettings.terms_content;

  return (
    <Dialog>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 sm:max-h-[85vh]">
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl text-foreground">{title}</DialogTitle>
          <DialogDescription className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {summary}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-5">
          <div className="whitespace-pre-line text-sm leading-7 text-foreground">
            {content}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}