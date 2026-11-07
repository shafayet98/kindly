import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kindly", template: "%s · Kindly" },
  description: "A team of AI companions who call, listen, and help healthy habits stick.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preload" href="/fonts/InstrumentSans-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
