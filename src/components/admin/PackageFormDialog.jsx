import React, { useEffect, useState } from "react";
import { baseClient } from "@/api/baseClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

const createDefaultForm = () => ({
  name: "",
  description: "",
  tour_type: "day_tour",
  price: 0,
  day_tour_price: 0,
  night_tour_price: 0,
  twenty_two_hour_price: 0,
  max_guests: 10,
  inclusions: [],
  gallery_images: [],
  image_url: "",
  is_active: true,
});

export default function PackageFormDialog({ open, onOpenChange, pkg, onSave }) {
  const [form, setForm] = useState(createDefaultForm());
  const [newInclusion, setNewInclusion] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(pkg ? {
      ...createDefaultForm(),
      ...pkg,
      inclusions: Array.isArray(pkg.inclusions) ? pkg.inclusions : [],
      gallery_images: Array.isArray(pkg.gallery_images)
        ? pkg.gallery_images
        : (pkg.image_url ? [pkg.image_url] : []),
    } : createDefaultForm());
    setNewInclusion("");
    setSaving(false);
    setUploadingImages(false);
  }, [open, pkg]);

  const handleSubmit = async () => {
    const dayTourPrice = Number(form.day_tour_price) || 0;
    const nightTourPrice = Number(form.night_tour_price) || 0;
    const twentyTwoHourPrice = Number(form.twenty_two_hour_price) || 0;

    const payload = {
      name: form.name,
      description: form.description,
      tour_type: form.tour_type,
      price: Math.min(dayTourPrice, nightTourPrice, twentyTwoHourPrice),
      day_tour_price: dayTourPrice,
      night_tour_price: nightTourPrice,
      twenty_two_hour_price: twentyTwoHourPrice,
      max_guests: Number(form.max_guests) || 1,
      inclusions: Array.isArray(form.inclusions) ? form.inclusions : [],
      gallery_images: Array.isArray(form.gallery_images) ? form.gallery_images : [],
      image_url: form.gallery_images?.[0] || form.image_url || "",
      is_active: Boolean(form.is_active),
    };

    setSaving(true);

    try {
      await onSave(payload);
      toast.success(pkg ? "Package updated successfully." : "Package created successfully.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error?.message || "Unable to save package.");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    setUploadingImages(true);

    try {
      const uploadedImages = [];

      for (const file of files) {
        const { file_url } = await baseClient.integrations.Core.UploadFile({ file });
        uploadedImages.push(file_url);
      }

      setForm((prev) => {
        const nextGallery = [...(Array.isArray(prev.gallery_images) ? prev.gallery_images : []), ...uploadedImages];
        return {
          ...prev,
          gallery_images: nextGallery,
          image_url: nextGallery[0] || "",
        };
      });
      toast.success(`${uploadedImages.length} package image${uploadedImages.length > 1 ? "s" : ""} uploaded.`);
    } catch (error) {
      toast.error(error?.message || "Unable to upload package images.");
    } finally {
      setUploadingImages(false);
      event.target.value = "";
    }
  };

  const removeImage = (imageUrl) => {
    setForm((prev) => {
      const nextGallery = (prev.gallery_images || []).filter((entry) => entry !== imageUrl);
      return {
        ...prev,
        gallery_images: nextGallery,
        image_url: nextGallery[0] || "",
      };
    });
  };

  const setCoverImage = (imageUrl) => {
    setForm((prev) => {
      const withoutTarget = (prev.gallery_images || []).filter((entry) => entry !== imageUrl);
      const nextGallery = [imageUrl, ...withoutTarget];
      return {
        ...prev,
        gallery_images: nextGallery,
        image_url: imageUrl,
      };
    });
  };

  const addInclusion = () => {
    if (!newInclusion.trim()) return;
    setForm({ ...form, inclusions: [...(form.inclusions || []), newInclusion.trim()] });
    setNewInclusion("");
  };

  const removeInclusion = (idx) => {
    setForm({ ...form, inclusions: form.inclusions.filter((_, i) => i !== idx) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={pkg?.id || "new-package"} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{pkg ? "Edit Package" : "Add New Package"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <div>
            <Label>Package Name *</Label>
            <Input value={form.name} onChange={e => setForm((prev) => ({...prev, name: e.target.value}))} placeholder="Deluxe Resort Package" className="mt-1" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm((prev) => ({...prev, description: e.target.value}))} placeholder="Describe the package..." rows={3} className="mt-1" />
          </div>
          <div>
            <Label>Tour Prices (₱) *</Label>
            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">Day Tour</Label>
                <Input type="number" value={form.day_tour_price} onChange={e => setForm((prev) => ({...prev, day_tour_price: parseFloat(e.target.value) || 0}))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Night Tour</Label>
                <Input type="number" value={form.night_tour_price} onChange={e => setForm((prev) => ({...prev, night_tour_price: parseFloat(e.target.value) || 0}))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">22 Hours</Label>
                <Input type="number" value={form.twenty_two_hour_price} onChange={e => setForm((prev) => ({...prev, twenty_two_hour_price: parseFloat(e.target.value) || 0}))} className="mt-1" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max Guests</Label>
              <Input type="number" value={form.max_guests} onChange={e => setForm((prev) => ({...prev, max_guests: parseInt(e.target.value) || 10}))} className="mt-1" />
            </div>
            <div>
              <Label>Package Images</Label>
              <div className="mt-1 space-y-3">
                <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                  {uploadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span>{uploadingImages ? "Uploading images..." : "Upload one or more images"}</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={uploadingImages} />
                </label>
                {form.gallery_images?.length ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {form.gallery_images.map((imageUrl, index) => (
                        <div key={imageUrl} className="overflow-hidden rounded-lg border border-border bg-muted/30">
                          <img src={imageUrl} alt={`${form.name || "Package"} preview ${index + 1}`} className="h-24 w-full object-cover" />
                          <div className="space-y-2 p-2">
                            <div className="text-[11px] text-muted-foreground">
                              {index === 0 ? "Cover image" : `Image ${index + 1}`}
                            </div>
                            <div className="flex gap-2">
                              {index !== 0 ? (
                                <Button type="button" variant="outline" size="sm" className="h-8 flex-1 px-2 text-xs" onClick={() => setCoverImage(imageUrl)}>
                                  Set Cover
                                </Button>
                              ) : null}
                              <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => removeImage(imageUrl)}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">The first image is used as the package cover and booking preview.</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No images uploaded yet.</p>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Inclusions</Label>
            <div className="flex gap-2 mt-1">
              <Input value={newInclusion} onChange={e => setNewInclusion(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addInclusion())} placeholder="e.g. Free breakfast" />
              <Button type="button" size="icon" variant="outline" onClick={addInclusion}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {form.inclusions?.map((item, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs">
                  {item}
                  <button onClick={() => removeInclusion(i)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={v => setForm((prev) => ({...prev, is_active: v}))} />
            <Label>Active (visible to users)</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || uploadingImages || !form.name || (!form.day_tour_price && !form.night_tour_price && !form.twenty_two_hour_price)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {pkg ? "Update" : "Create"} Package
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}