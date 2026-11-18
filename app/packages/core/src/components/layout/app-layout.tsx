"use client";

import { AppHeader } from "@workspace/core/components/layout/app-header";
import { AppSidebar } from "@workspace/core/components/layout/app-sidebar";
import { StatusBar } from "@workspace/core/components/layout/status-bar";
import { PoseStudioHost } from "@workspace/core/components/pose-studio/pose-studio-host";
import { SceneEditors } from "@workspace/core/components/scene-editors";
import {
  type LinkComponent,
  normalizePath,
} from "@workspace/core/config/navigation";
import { useConnectionMonitor } from "@workspace/core/hooks/use-connection-monitor";
import { useCatalog } from "@workspace/core/hooks/use-control-center";
import { useModelMemory } from "@workspace/core/hooks/use-model-memory";
import { useRuntimeAutostart } from "@workspace/core/hooks/use-runtime-autostart";
import { ThemeProvider } from "@workspace/core/providers/theme-provider";
import {
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar";
import { Toaster } from "@workspace/ui/components/sonner";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
  LinkComponent?: LinkComponent;
  pathname: string;
}

function BackgroundServices() {
  useConnectionMonitor();
  useRuntimeAutostart();
  useModelMemory();
  useCatalog();
  return null;
}

export function AppLayout({
  children,
  LinkComponent = "a",
  pathname,
}: AppLayoutProps) {
  const path = normalizePath(pathname);
  const scene = path === "/backgrounds" || path === "/cg";
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange={true}
      enableColorScheme={true}
      enableSystem={true}
    >
      <TooltipProvider>
        <BackgroundServices />
        <SidebarProvider className="h-screen">
          <AppSidebar LinkComponent={LinkComponent} pathname={pathname} />
          <SidebarInset className="min-h-0 overflow-hidden">
            <AppHeader pathname={pathname} />
            <div
              className={`studio-workspace min-h-0 min-w-0 flex-1 ${scene ? "overflow-clip" : "overflow-auto"}`}
            >
              <SceneEditors pathname={path} />
              {children}
            </div>
            <StatusBar />
          </SidebarInset>
        </SidebarProvider>
        <PoseStudioHost />
        <Toaster position="bottom-right" richColors={true} />
      </TooltipProvider>
    </ThemeProvider>
  );
}
