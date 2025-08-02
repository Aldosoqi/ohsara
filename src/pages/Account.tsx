import { useState } from "react";
import { User, ChevronLeft, Settings, Bell, Users, HelpCircle, LogOut, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Account = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          username: username || null,
        })
        .eq('user_id', user.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update profile. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Profile updated",
          description: "Your profile has been updated successfully.",
        });
        await refreshProfile();
        setIsEditing(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Left Sidebar */}
        <div className="w-64 bg-muted/30 border-r border-border min-h-screen p-4">
          <div className="mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="mb-4 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h2 className="text-sm font-medium text-muted-foreground mb-4">Account</h2>
          </div>

          <nav className="space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-start text-foreground bg-accent"
              disabled
            >
              <User className="h-4 w-4 mr-3" />
              Account
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              disabled
            >
              <Settings className="h-4 w-4 mr-3" />
              Preferences
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              disabled
            >
              <Bell className="h-4 w-4 mr-3" />
              Notifications
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              disabled
            >
              <Users className="h-4 w-4 mr-3" />
              Team
            </Button>
          </nav>

          <Separator className="my-6" />

          <div className="space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Support</h3>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              disabled
            >
              <HelpCircle className="h-4 w-4 mr-3" />
              Help & Support
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-foreground mb-8">Account</h1>

            {/* Profile Section */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Profile
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (isEditing) {
                        setFullName(profile?.full_name || "");
                        setUsername(profile?.username || "");
                      }
                      setIsEditing(!isEditing);
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="text-lg">
                      {profile?.full_name?.charAt(0) || user.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Button variant="outline" size="sm" disabled>
                      Change avatar
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="fullName">Full Name</Label>
                    {isEditing ? (
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Enter your full name"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        {profile?.full_name || "Not set"}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="username">Username</Label>
                    {isEditing ? (
                      <Input
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Choose a username"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        {profile?.username || "Not set"}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Email</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {user.email}
                    </p>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex space-x-2">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? "Saving..." : "Save changes"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setFullName(profile?.full_name || "");
                        setUsername(profile?.username || "");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Credits Section */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Credits</CardTitle>
                <CardDescription>Your current summary credits</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-semibold">
                      {profile?.credits || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Available credits</p>
                  </div>
                  <Button onClick={() => navigate("/upgrade")}>
                    Purchase Credits
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* System Section */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>System</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Support</p>
                      <p className="text-sm text-muted-foreground">Get help with your account</p>
                    </div>
                    <Button variant="outline" size="sm" disabled>
                      Contact
                    </Button>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">You are signed in as {user.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Manage your session and account access
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSignOut}
                      className="text-destructive hover:text-destructive"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign out
                    </Button>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-destructive">Delete account</p>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete your account and data
                      </p>
                    </div>
                    <Button variant="outline" size="sm" disabled className="text-destructive">
                      Learn more
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Account;