"use client";

import { MeasurementsProvider } from "./measurements-context";
import AppShell from "./AppShell";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MeasurementsProvider>
      <AppShell>{children}</AppShell>
    </MeasurementsProvider>
  );
}
