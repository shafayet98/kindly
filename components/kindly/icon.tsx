// Line icons from the Kindly design system (20×20 grid, stroked with currentColor).
const PATHS = {
  "walk": `<circle cx="11.5" cy="3.5" r="1.6"/><path d="M10.5 7 8 11.5l3 2v4.5M10.5 7l2.5 3.5 3 .5M8 11.5l-2.5 1.5M11 13.5 8.5 18"/>`,
  "workout": `<path d="M3 8v4M5.5 5.5v9M14.5 5.5v9M17 8v4M5.5 10h9"/>`,
  "medication": `<path d="M3.9 16.1a3.5 3.5 0 0 1 0-4.95l7.25-7.25a3.5 3.5 0 0 1 4.95 4.95l-7.25 7.25a3.5 3.5 0 0 1-4.95 0zM7.5 7.5l5 5"/>`,
  "sleep": `<path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9z"/>`,
  "food": `<path d="M2.5 10h15a7.5 7.5 0 0 1-15 0zM10 10c0-3.2 2.2-5.6 5.5-5.6 0 3.2-2.2 5.6-5.5 5.6zM6 10c0-2 .8-3.6 2.4-4.4"/>`,
  "smoking": `<path d="M2.5 11.5h10v3h-10zM15 11.5v3M17.5 11.5v3M15 9c0-1.5 1.5-1.5 1.5-3M3 3l14 14"/>`,
  "mindfulness": `<path d="M10 16.5c-4 0-7.5-2-7.5-5.2 2.2 0 4.2.9 5.3 2.2M10 16.5c4 0 7.5-2 7.5-5.2-2.2 0-4.2.9-5.3 2.2M10 16.5c-1.7-1.6-2.6-3.7-2.6-6.1S8.3 6 10 4.3c1.7 1.7 2.6 3.7 2.6 6.1s-.9 4.5-2.6 6.1z"/>`,
  "other": `<path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"/>`,
  "bell": `<path d="M5 8.5a5 5 0 0 1 10 0v3.5l1.5 2.5h-13L5 12zM8 16.5a2 2 0 0 0 4 0"/>`,
  "check": `<path d="M4 10.5l4 4 8-9"/>`,
  "dash": `<path d="M5.5 10h9"/>`,
  "moved": `<path d="M3.5 10h11M11 6l4 4-4 4"/>`,
  "clock": `<circle cx="10" cy="10" r="7.2"/><path d="M10 6v4.2l2.8 1.8"/>`,
  "mic": `<rect x="7.5" y="2.5" width="5" height="9.5" rx="2.5"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/>`,
  "phone": `<path d="M5.2 2.8h2.7l1.4 3.6-1.9 1.3a9.5 9.5 0 0 0 4.9 4.9l1.3-1.9 3.6 1.4v2.7a1.9 1.9 0 0 1-2 1.9C8.8 16.3 3.7 11.2 3.3 4.8a1.9 1.9 0 0 1 1.9-2z"/>`,
  "chev-left": `<path d="M12.5 4.5 7 10l5.5 5.5"/>`,
  "chev-right": `<path d="M7.5 4.5 13 10l-5.5 5.5"/>`,
  "chev-down": `<path d="M5 7.5l5 5 5-5"/>`,
  "x": `<path d="M5 5l10 10M15 5 5 15"/>`,
  "arrow-right": `<path d="M3.5 10h12.5M11.5 5.5 16 10l-4.5 4.5"/>`,
  "arrow-left": `<path d="M16.5 10H4M8.5 5.5 4 10l4.5 4.5"/>`,
  "info": `<circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6.3v.2"/>`,
  "alert": `<path d="M10 2.8 18 17H2zM10 8v4M10 14.4v.2"/>`,
  "plus": `<path d="M10 4v12M4 10h12"/>`,
  "heart": `<path d="M10 16.5S3.5 12.8 3.5 7.9A3.4 3.4 0 0 1 10 6.1a3.4 3.4 0 0 1 6.5 1.8c0 4.9-6.5 8.6-6.5 8.6z"/>`,
  "users": `<circle cx="7.5" cy="7" r="3"/><path d="M2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13 4.2a3 3 0 0 1 0 5.6M15 12.3c1.8.6 3 2.3 3 4.7"/>`,
  "lock": `<rect x="4" y="9" width="12" height="8.5" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>`,
  "pin": `<path d="M10 18s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="10" cy="8" r="2"/>`,
  "mail": `<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="m3 5.5 7 5.5 7-5.5"/>`,
  "edit": `<path d="M13.5 3.5l3 3L7 16H4v-3z"/>`,
  "undo": `<path d="M7 4.5 3 8.5l4 4M3 8.5h9a5 5 0 0 1 0 10h-2"/>`,
  "calendar": `<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v3M13 2.5v3"/>`,
  "chart": `<path d="M4 16.5V10M10 16.5V4M16 16.5v-6"/>`,
  "home": `<path d="M3 9 10 3l7 6v8H12v-5H8v5H3z"/>`,
  "settings": `<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>`,
  "logout": `<path d="M8 3.5H4.5v13H8M12.5 6.5 16 10l-3.5 3.5M16 10H7.5"/>`,
  "sparkle": `<path d="M10 2.5c.6 3.8 2.2 6 5.5 6.5-3.3.6-4.9 2.7-5.5 6.5-.6-3.8-2.2-5.9-5.5-6.5 3.3-.5 4.9-2.7 5.5-6.5z"/>`,
  "eye": `<path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10z"/><circle cx="10" cy="10" r="2.5"/>`,
  "volume": `<path d="M3 8v4h3l4.5 3.5v-11L6 8zM13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5a7 7 0 0 1 0 10"/>`,
  "shield": `<path d="M10 2.5 16 5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5z"/>`,
  "bubble": `<path d="M4 3.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H8l-4 3v-3a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 4 3.5z"/>`,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "", label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 20 20"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}
