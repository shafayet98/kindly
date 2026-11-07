"use client";

import { useState, useTransition } from "react";
import { setTimezoneFromDevice, setTimezoneFromLocation, type LocationResult } from "@/app/(patient)/location-actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/** Asks for the browser's location once, to set the timezone. Falls back to the device timezone. */
export function LocationPicker({ onSaved, skipLabel }: { onSaved?: () => Promise<void>; skipLabel?: string }) {
  const [result, setResult] = useState<LocationResult | null>(null);
  const [pending, startTransition] = useTransition();

  const finish = (outcome: LocationResult) => {
    setResult(outcome);
    if (outcome.ok && onSaved) startTransition(onSaved);
  };

  const fromDevice = () =>
    startTransition(async () => {
      finish(await setTimezoneFromDevice(Intl.DateTimeFormat().resolvedOptions().timeZone));
    });

  const fromLocation = () => {
    if (!("geolocation" in navigator)) return fromDevice();
    navigator.geolocation.getCurrentPosition(
      (position) =>
        startTransition(async () => {
          // Rounded to about 1 km before it leaves the browser; it's only used to find the timezone.
          const round = (value: number) => Math.round(value * 100) / 100;
          finish(await setTimezoneFromLocation(round(position.coords.latitude), round(position.coords.longitude)));
        }),
      () => {
        setResult({ ok: false, error: "Location wasn't shared. We'll use this device's timezone instead." });
        fromDevice();
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {result && <Notice tone={result.ok ? "success" : "error"}>{result.ok ? `Your timezone is set to ${result.label}.` : result.error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={fromLocation} disabled={pending}>
          {pending ? "Setting…" : "Use my location"}
        </Button>
        <Button variant="secondary" onClick={fromDevice} disabled={pending}>
          {skipLabel ?? "Use this device's timezone"}
        </Button>
      </div>
    </div>
  );
}
