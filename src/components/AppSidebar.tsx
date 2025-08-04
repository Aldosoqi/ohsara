import { Home, History, User, Crown, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navigationItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "History", url: "/history", icon: History },
  { title: "Account", url: "/account", icon: User },
  { title: "Upgrade", url: "/upgrade", icon: Crown },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar
      className={`${isCollapsed ? "w-16" : "w-64"} border-r border-sidebar-border`}
      collapsible="icon"
    >
      <SidebarContent className="bg-sidebar">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="ohsara-logo text-xl font-semibold">
            {!isCollapsed && "ohsara"}
          </div>
        </div>

        <SidebarGroup className="px-3 py-4">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className={({ isActive }) => {
                        const baseClasses = `nav-item ${isActive ? "nav-item-active" : ""}`;
                        return item.title === "Upgrade" 
                          ? `${baseClasses} bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/30 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105`
                          : baseClasses;
                      }}
                    >
                      <item.icon className={
                        item.title === "Upgrade" 
                          ? "h-5 w-5 flex-shrink-0 text-amber-500 drop-shadow-sm" 
                          : "h-5 w-5 flex-shrink-0"
                      } />
                      {!isCollapsed && (
                        <span className={
                          item.title === "Upgrade"
                            ? "font-semibold text-amber-600 dark:text-amber-400"
                            : "font-medium"
                        }>
                          {item.title}
                          {item.title === "Upgrade" && (
                            <span className="ml-2 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                              ✨ PRO
                            </span>
                          )}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}