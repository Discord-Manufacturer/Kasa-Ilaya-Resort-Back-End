import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { baseClient } from "@/api/baseClient";
import FoundItemsGallery from "@/components/home/FoundItemsGallery";

export default function Amenities() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

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

  if (isCheckingAuth) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-background">
      <FoundItemsGallery />
    </div>
  );
}