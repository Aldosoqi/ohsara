import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SettingsContextType {
  // Appearance
  appearance: string;
  setAppearance: (theme: string) => void;
  
  // Language
  language: string;
  setLanguage: (lang: string) => void;
  responseLanguage: string;
  setResponseLanguage: (lang: string) => void;
  
  // Features
  autosuggest: boolean;
  setAutosuggest: (enabled: boolean) => void;
  homepageWidgets: boolean;
  setHomepageWidgets: (enabled: boolean) => void;
  
  // Notifications
  requestNotifications: boolean;
  setRequestNotifications: (enabled: boolean) => void;
  emailNotifications: boolean;
  setEmailNotifications: (enabled: boolean) => void;
  pushNotifications: boolean;
  setPushNotifications: (enabled: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setTheme } = useTheme();
  const { user, profile } = useAuth();
  
  // Initialize settings from profile if available, otherwise localStorage or defaults
  const [appearance, setAppearanceState] = useState(() => 
    (profile as any)?.appearance_preference || localStorage.getItem('ohsara-appearance') || 'system'
  );
  const [language, setLanguageState] = useState(() => 
    (profile as any)?.language_preference || localStorage.getItem('ohsara-language') || 'american-english'
  );
  const [responseLanguage, setResponseLanguageState] = useState(() => 
    (profile as any)?.response_language_preference || localStorage.getItem('ohsara-response-language') || 'automatic'
  );
  const [autosuggest, setAutosuggestState] = useState(() => 
    localStorage.getItem('ohsara-autosuggest') !== 'false'
  );
  const [homepageWidgets, setHomepageWidgetsState] = useState(() => 
    localStorage.getItem('ohsara-homepage-widgets') !== 'false'
  );
  const [requestNotifications, setRequestNotificationsState] = useState(() => 
    localStorage.getItem('ohsara-request-notifications') !== 'false'
  );
  const [emailNotifications, setEmailNotificationsState] = useState(() => 
    localStorage.getItem('ohsara-email-notifications') === 'true'
  );
  const [pushNotifications, setPushNotificationsState] = useState(() => 
    localStorage.getItem('ohsara-push-notifications') !== 'false'
  );

  // Wrapper functions that update both state, localStorage, and database
  const setAppearance = async (theme: string) => {
    setAppearanceState(theme);
    localStorage.setItem('ohsara-appearance', theme);
    
    // Save to database if user is logged in
    if (user) {
      await supabase.from('profiles').update({ appearance_preference: theme }).eq('user_id', user.id);
    }
    
    // Map our appearance setting to next-themes
    const themeMap: { [key: string]: string } = {
      'light': 'light',
      'dark': 'dark',
      'system': 'system'
    };
    setTheme(themeMap[theme] || 'system');
  };

  const setLanguage = async (lang: string) => {
    setLanguageState(lang);
    localStorage.setItem('ohsara-language', lang);
    
    // Save to database if user is logged in
    if (user) {
      await supabase.from('profiles').update({ language_preference: lang }).eq('user_id', user.id);
    }
  };

  const setResponseLanguage = async (lang: string) => {
    setResponseLanguageState(lang);
    localStorage.setItem('ohsara-response-language', lang);
    
    // Save to database if user is logged in
    if (user) {
      await supabase.from('profiles').update({ response_language_preference: lang }).eq('user_id', user.id);
    }
  };

  const setAutosuggest = (enabled: boolean) => {
    setAutosuggestState(enabled);
    localStorage.setItem('ohsara-autosuggest', enabled.toString());
  };

  const setHomepageWidgets = (enabled: boolean) => {
    setHomepageWidgetsState(enabled);
    localStorage.setItem('ohsara-homepage-widgets', enabled.toString());
  };

  const setRequestNotifications = (enabled: boolean) => {
    setRequestNotificationsState(enabled);
    localStorage.setItem('ohsara-request-notifications', enabled.toString());
  };

  const setEmailNotifications = (enabled: boolean) => {
    setEmailNotificationsState(enabled);
    localStorage.setItem('ohsara-email-notifications', enabled.toString());
  };

  const setPushNotifications = (enabled: boolean) => {
    setPushNotificationsState(enabled);
    localStorage.setItem('ohsara-push-notifications', enabled.toString());
  };

  // Apply theme on mount
  useEffect(() => {
    const themeMap: { [key: string]: string } = {
      'light': 'light',
      'dark': 'dark',
      'system': 'system'
    };
    setTheme(themeMap[appearance] || 'system');
  }, [appearance, setTheme]);

  // Sync with profile changes when user logs in or profile updates
  useEffect(() => {
    if (profile) {
      const profileAny = profile as any;
      if (profileAny.appearance_preference && profileAny.appearance_preference !== appearance) {
        setAppearanceState(profileAny.appearance_preference);
      }
      if (profileAny.language_preference && profileAny.language_preference !== language) {
        setLanguageState(profileAny.language_preference);
      }
      if (profileAny.response_language_preference && profileAny.response_language_preference !== responseLanguage) {
        setResponseLanguageState(profileAny.response_language_preference);
      }
    }
  }, [profile]);

  // Request notification permissions if push notifications are enabled
  useEffect(() => {
    if (pushNotifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [pushNotifications]);

  const value = {
    appearance,
    setAppearance,
    language,
    setLanguage,
    responseLanguage,
    setResponseLanguage,
    autosuggest,
    setAutosuggest,
    homepageWidgets,
    setHomepageWidgets,
    requestNotifications,
    setRequestNotifications,
    emailNotifications,
    setEmailNotifications,
    pushNotifications,
    setPushNotifications,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};