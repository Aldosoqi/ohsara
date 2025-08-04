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
                        const baseClass = `nav-item ${isActive ? "nav-item-active" : ""}`;
                        if (item.title === "Upgrade") {
                          return `${baseClass} relative overflow-hidden bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 hover:from-amber-500/20 hover:to-yellow-500/20 hover:border-amber-400/40 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-amber-500/20`;
                        }
                        return baseClass;
                      }}
                    >
                      <item.icon className={`h-5 w-5 flex-shrink-0 ${item.title === "Upgrade" ? "text-amber-500" : ""}`} />
                      {!isCollapsed && (
                        <span className={`font-medium ${item.title === "Upgrade" ? "text-amber-600 font-semibold" : ""}`}>
                          {item.title}
                          {item.title === "Upgrade" && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-full animate-pulse">
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