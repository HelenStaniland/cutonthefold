"use client";

import { MeasurementsProvider } from "./measurements-context";
import { StyleProvider } from "./style-context";
import AppShell from "./AppShell";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MeasurementsProvider>
      <StyleProvider>
        <AppShell>{children}</AppShell>
      </StyleProvider>
    </MeasurementsProvider>
  );
}
