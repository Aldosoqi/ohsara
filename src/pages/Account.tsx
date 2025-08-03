import { useState } from "react";
import { User, ChevronLeft, Settings, Bell, Users, HelpCircle, LogOut, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
  const [currentSection, setCurrentSection] = useState("account");
  const [deleting, setDeleting] = useState(false);
  
  // Preferences state
  const [appearance, setAppearance] = useState("system");
  const [language, setLanguage] = useState("american-english");
  const [responseLanguage, setResponseLanguage] = useState("automatic");
  const [autosuggest, setAutosuggest] = useState(true);
  const [homepageWidgets, setHomepageWidgets] = useState(true);
  
  // Notifications state
  const [requestNotifications, setRequestNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(true);

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

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setDeleting(true);
    try {
      // First delete user profile and related data
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', user.id);

      if (profileError) {
        throw profileError;
      }

      // Then delete the auth user
      const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
      
      if (authError) {
        throw authError;
      }

      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted.",
      });
      
      await signOut();
      navigate("/");
    } catch (error) {
      console.error('Delete account error:', error);
      toast({
        title: "Error",
        description: "Failed to delete account. Please contact support.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
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
              className={`w-full justify-start ${currentSection === "account" ? "text-foreground bg-accent" : "text-muted-foreground"}`}
              onClick={() => setCurrentSection("account")}
            >
              <User className="h-4 w-4 mr-3" />
              Account
            </Button>
            <Button
              variant="ghost"
              className={`w-full justify-start ${currentSection === "preferences" ? "text-foreground bg-accent" : "text-muted-foreground"}`}
              onClick={() => setCurrentSection("preferences")}
            >
              <Settings className="h-4 w-4 mr-3" />
              Preferences
            </Button>
            <Button
              variant="ghost"
              className={`w-full justify-start ${currentSection === "notifications" ? "text-foreground bg-accent" : "text-muted-foreground"}`}
              onClick={() => setCurrentSection("notifications")}
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
            <h1 className="text-2xl font-semibold text-foreground mb-8">
              {currentSection === "account" && "Account"}
              {currentSection === "preferences" && "Preferences"}
              {currentSection === "notifications" && "Notifications"}
            </h1>

            {currentSection === "account" && (
              <>
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete your account
                                and remove all your data from our servers.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleDeleteAccount}
                                disabled={deleting}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deleting ? "Deleting..." : "Delete Account"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {currentSection === "preferences" && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Preferences</CardTitle>
                  <CardDescription>Customize how Ohsara looks and behaves on your device</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Appearance</Label>
                      <p className="text-sm text-muted-foreground">How Ohsara looks on your device</p>
                    </div>
                    <Select value={appearance} onValueChange={setAppearance}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System (Light)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Language</Label>
                      <p className="text-sm text-muted-foreground">The language used in the user interface</p>
                    </div>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="american-english">American English</SelectItem>
                        <SelectItem value="british-english">British English</SelectItem>
                        <SelectItem value="spanish">Spanish</SelectItem>
                        <SelectItem value="french">French</SelectItem>
                        <SelectItem value="german">German</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Preferred response language</Label>
                      <p className="text-sm text-muted-foreground">The language used for AI responses</p>
                    </div>
                    <Select value={responseLanguage} onValueChange={setResponseLanguage}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="automatic">Automatic (detect inp...)</SelectItem>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="spanish">Spanish</SelectItem>
                        <SelectItem value="french">French</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Autosuggest</Label>
                      <p className="text-sm text-muted-foreground">Enable dropdown and tab-complete suggestions while typing a query</p>
                    </div>
                    <Switch
                      checked={autosuggest}
                      onCheckedChange={setAutosuggest}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Homepage widgets</Label>
                      <p className="text-sm text-muted-foreground">Enable personalized widgets on the homepage</p>
                    </div>
                    <Switch
                      checked={homepageWidgets}
                      onCheckedChange={setHomepageWidgets}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {currentSection === "notifications" && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>Configure when and how you receive notifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Request completion notifications</Label>
                      <p className="text-sm text-muted-foreground">Get notified when your YouTube summary requests are completed</p>
                    </div>
                    <Switch
                      checked={requestNotifications}
                      onCheckedChange={setRequestNotifications}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Email notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                    </div>
                    <Switch
                      checked={emailNotifications}
                      onCheckedChange={setEmailNotifications}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Push notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive browser push notifications</p>
                    </div>
                    <Switch
                      checked={pushNotifications}
                      onCheckedChange={setPushNotifications}
                    />
                  </div>

                  <Separator />

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Notification behavior when away</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      When you leave the app while a request is processing, we'll send you a notification 
                      when it's completed so you don't miss your results.
                    </p>
                    <div className="flex items-center space-x-2 text-sm">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-muted-foreground">Active when request notifications are enabled</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Account;