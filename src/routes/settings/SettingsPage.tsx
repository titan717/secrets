import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SettingsHome } from "./Home";
import { AboutScreen, NameScreen, ProfileScreen } from "./Profile";
import { AccountScreen } from "./Account";
import { AppIconScreen, AppearanceScreen, ClockScreen, ColorsScreen, HapticsScreen, ThemeScreen, WallpaperScreen } from "./Appearance";
import { AddAccountScreen, FontsScreen, HelpScreen, LanguageScreen, NotificationsScreen, PrivacyScreen, StorageScreen, StoriesScreen } from "./Other";
import "./settings.css";

/**
 * Settings: one stacked screen at a time on mobile (blueprint p4–p20); on desktop the
 * settings home stays on the left and the open screen fills the right.
 */
export function SettingsPage() {
  const loc = useLocation();
  const atRoot = /^\/(settings|profile)\/?$/.test(loc.pathname);
  return (
    <div className={`settings ${atRoot ? "at-root" : "in-section"}`}>
      <aside className="settings-nav">
        <SettingsHome />
      </aside>
      <div className="settings-main">
        <Routes>
          <Route index element={<div className="desktop-only-block"><AppearanceScreen /></div>} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="profile/name" element={<NameScreen />} />
          <Route path="profile/about" element={<AboutScreen />} />
          <Route path="account" element={<AccountScreen />} />
          <Route path="appearance" element={<AppearanceScreen />} />
          <Route path="appearance/theme" element={<ThemeScreen />} />
          <Route path="appearance/colors" element={<ColorsScreen />} />
          <Route path="appearance/clock" element={<ClockScreen />} />
          <Route path="appearance/haptics" element={<HapticsScreen />} />
          <Route path="appearance/app-icon" element={<AppIconScreen />} />
          <Route path="appearance/wallpaper" element={<WallpaperScreen />} />
          <Route path="fonts" element={<FontsScreen />} />
          <Route path="stories" element={<StoriesScreen />} />
          <Route path="language" element={<LanguageScreen />} />
          <Route path="help" element={<HelpScreen />} />
          <Route path="add-account" element={<AddAccountScreen />} />
          <Route path="privacy" element={<PrivacyScreen />} />
          <Route path="notifications" element={<NotificationsScreen />} />
          <Route path="storage" element={<StorageScreen />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </div>
    </div>
  );
}
