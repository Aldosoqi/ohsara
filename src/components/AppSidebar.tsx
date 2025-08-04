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
                        if (item.title === "Upgrade") {
                          return `nav-item relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 rounded-lg ${
                            isActive ? "nav-item-active" : ""
                          }`;
                        }
                        return `nav-item ${isActive ? "nav-item-active" : ""}`;
                      }}
                    >
                      {item.title === "Upgrade" && (
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 opacity-100 animate-pulse"></div>
                      )}
                      <item.icon 
                        className={`h-5 w-5 flex-shrink-0 relative z-10 ${
                          item.title === "Upgrade" ? "text-yellow-300 drop-shadow-sm" : ""
                        }`} 
                      />
                      {!isCollapsed && (
                        <span className={`font-medium relative z-10 ${
                          item.title === "Upgrade" ? "font-bold text-white drop-shadow-sm" : ""
                        }`}>
                          {item.title}
                          {item.title === "Upgrade" && (
                            <span className="ml-1 text-yellow-300 text-xs">✨</span>
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