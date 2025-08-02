import { Settings as SettingsIcon } from "lucide-react";

const Settings = () => {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">Customize your Ohsara experience</p>
        </div>

        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-full mb-4">
            <SettingsIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Settings Panel</h3>
          <p className="text-muted-foreground">
            Coming soon - customize your preferences here
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;