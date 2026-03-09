"use client";

import { Check } from "lucide-react";

export function SuccessCheck() {
  return (
    <div className="rounded-full bg-green-500 p-1 animate-in zoom-in-50 duration-200">
      <Check className="h-3 w-3 text-white" />
    </div>
  );
}
