import { Home, History, User, Crown, Settings, Coins } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CreditTransactions } from "@/components/CreditTransactions";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
const navigationItems = [{
  title: "Home",
  url: "/",
  icon: Home
}, {
  title: "History",
  url: "/history",
  icon: History
}, {
  title: "Account",
  url: "/account",
  icon: User
}, {
  title: "Upgrade",
  url: "/upgrade",
  icon: Crown
}, {
  title: "Settings",
  url: "/settings",
  icon: Settings
}];
export function AppSidebar() {
  const {
    state
  } = useSidebar();
  const isCollapsed = state === "collapsed";
  const {
    profile
  } = useAuth();
  return <Sidebar className={`${isCollapsed ? "w-16" : "w-64"} border-r border-sidebar-border`} collapsible="icon">
      <SidebarContent className="bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="ohsara-logo text-xl font-semibold">
            {!isCollapsed && "Ohsara AI"}
          </div>
        </div>

        <SidebarGroup className="px-3 py-4">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {navigationItems.map(item => <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={({
                  isActive
                }) => `nav-item ${isActive ? "nav-item-active" : ""}`}>
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!isCollapsed && <span className="font-medium">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* Credits footer */}
        <div className="mt-auto p-4 border-t border-sidebar-border">
          {isCollapsed ? <div className="flex items-center justify-center">
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
                <Coins className="h-4 w-4" />
                <span className="text-sm font-medium">{Number(profile?.credits ?? 0).toFixed(1)}</span>
              </div>
            </div> : <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center justify-center w-6 h-6 bg-sidebar-accent rounded-full">
                  <Coins className="h-3 w-3 text-sidebar-accent-foreground" />
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Credits: </span>
                  <span className="font-semibold text-foreground">{Number(profile?.credits ?? 0).toFixed(1)}</span>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                <p><strong>Content Length Pricing:</strong></p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span>• Micro: 1</span>
                  <span>• Short : 2</span>
                  <span>• Medium : 3</span>
                  <span>• Long : 4</span>
                  <span>• Extended : 6</span>
                  <span>• Marathon: 8</span>
                </div>
                <p className="pt-1">• Chat: 10% of analysis cost</p>
              </div>
              
              <CreditTransactions />
            </div>}
        </div>

      </SidebarContent>
    </Sidebar>;
}