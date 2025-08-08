import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { MainLayout } from "./components/MainLayout";
import Index from "./pages/Index";
import History from "./pages/History";
import Account from "./pages/Account";
import Auth from "./pages/Auth";
import Upgrade from "./pages/Upgrade";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Intelligent from "./pages/Intelligent";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Auth route - standalone without main layout */}
          <Route path="/auth" element={<Auth />} />
          
          {/* Main app routes with layout */}
          <Route path="/*" element={
            <MainLayout>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/history" element={<History />} />
                <Route path="/account" element={<Account />} />
                <Route path="/upgrade" element={<Upgrade />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/intelligent" element={<Intelligent />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </MainLayout>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
