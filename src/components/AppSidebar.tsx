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
                      className={({ isActive }) =>
                        item.title === "Upgrade" 
                          ? `nav-item group relative overflow-hidden ${isActive ? "nav-item-active" : "bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border border-yellow-300 dark:border-yellow-700 hover:from-yellow-100 hover:to-amber-100 dark:hover:from-yellow-900/30 dark:hover:to-amber-900/30 text-yellow-800 dark:text-yellow-200 shadow-md hover:shadow-lg transition-all duration-300"}`
                          : `nav-item ${isActive ? "nav-item-active" : ""}`
                      }
                    >
                      <item.icon className={`h-5 w-5 flex-shrink-0 ${item.title === "Upgrade" ? "text-yellow-600 dark:text-yellow-400" : ""}`} />
                      {!isCollapsed && (
                        <span className={`font-medium ${item.title === "Upgrade" ? "relative z-10" : ""}`}>
                          {item.title}
                          {item.title === "Upgrade" && (
                            <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-semibold bg-yellow-400 dark:bg-yellow-600 text-yellow-900 dark:text-yellow-100 rounded-full animate-pulse">
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