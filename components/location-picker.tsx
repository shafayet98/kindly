"use client";

import { useState, useTransition } from "react";
import { setTimezoneFromDevice, setTimezoneFromLocation, type LocationResult } from "@/app/(patient)/location-actions";
import { Icon } from "@/components/kindly/icon";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/**
 * Asks for the browser's location once, to set the timezone. Falls back to the device timezone.
 * "cards" is the onboarding layout; "buttons" is used in Settings.
 */
export function LocationPicker({ onSaved, layout = "buttons", deviceLabel }: { onSaved?: () => Promise<void>; layout?: "cards" | "buttons"; deviceLabel?: string }) {
  const [result, setResult] = useState<LocationResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"location" | "device" | null>(null);

  const finish = (outcome: LocationResult) => {
    setResult(outcome);
    setBusy(null);
    if (outcome.ok && onSaved) startTransition(onSaved);
  };

  const fromDevice = () => {
    setBusy("device");
    startTransition(async () => finish(await setTimezoneFromDevice(Intl.DateTimeFormat().resolvedOptions().timeZone)));
  };

  const fromLocation = () => {
    if (!("geolocation" in navigator)) return fromDevice();
    setBusy("location");
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

  const notice = result && <Notice tone={result.ok ? "success" : "error"}>{result.ok ? `Your timezone is set to ${result.label}.` : result.error}</Notice>;

  if (layout === "cards") {
    return (
      <div className="stack-24">
        {notice}
        <div className="grid-2">
          <button
            type="button"
            className="card card--lg stack"
            onClick={fromLocation}
            disabled={pending}
            aria-busy={busy === "location" || undefined}
            style={{ textAlign: "left", cursor: "pointer", borderColor: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--ink)" }}
          >
            <span className="cat-icon" style={{ background: "var(--ember)" }}>
              <Icon name="pin" />
            </span>
            <span className="title" style={{ display: "block" }}>
              {busy === "location" ? "Finding your timezone…" : "Use my location"}
            </span>
            <span className="muted small" style={{ display: "block" }}>
              Your browser will ask first. Quickest and most accurate.
            </span>
          </button>
          <button
            type="button"
            className="card card--lg stack"
            onClick={fromDevice}
            disabled={pending}
            aria-busy={busy === "device" || undefined}
            style={{ textAlign: "left", cursor: "pointer" }}
          >
            <span className="cat-icon">
              <Icon name="clock" />
            </span>
            <span className="title" style={{ display: "block" }}>
              No thanks, use this device&apos;s timezone
            </span>
            <span className="muted small" style={{ display: "block" }}>
              {deviceLabel ?? "We'll use the timezone this device is set to."}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {notice}
      <div className="row" style={{ gap: 16 }}>
        <Button size="lg" onClick={fromLocation} disabled={pending} aria-busy={busy === "location" || undefined}>
          <Icon name="pin" />
          Use my location
        </Button>
        <Button variant="ghost" size="lg" onClick={fromDevice} disabled={pending} aria-busy={busy === "device" || undefined}>
          <Icon name="clock" />
          Use this device&apos;s timezone
        </Button>
      </div>
    </div>
  );
}
