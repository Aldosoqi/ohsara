import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Menu, Coins } from "lucide-react";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { profile } = useAuth();
  
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Top bar with sidebar trigger and credits */}
          <header className="h-14 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
            <SidebarTrigger className="">
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
            
            {/* Credits tracker */}
            <Card className="bg-card/50 border-border/50 shadow-none">
              <CardContent className="flex items-center gap-2 py-1.5 px-3">
                <div className="inline-flex items-center justify-center w-6 h-6 bg-primary/10 rounded-full">
                  <Coins className="h-3 w-3 text-primary" />
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Credits: </span>
                  <span className="font-medium text-foreground">{profile?.credits || 0}</span>
                </div>
              </CardContent>
            </Card>
          </header>

          {/* Main content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}