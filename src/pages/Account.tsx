import { User } from "lucide-react";

const Account = () => {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Account</h1>
          <p className="text-muted-foreground">Manage your profile and preferences</p>
        </div>

        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-full mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Account Settings</h3>
          <p className="text-muted-foreground">
            Coming soon - manage your account settings here
          </p>
        </div>
      </div>
    </div>
  );
};

export default Account;