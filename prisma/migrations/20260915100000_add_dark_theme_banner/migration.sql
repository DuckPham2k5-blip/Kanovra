-- A project can carry a different backdrop per theme. The existing banner
-- columns are the light theme's; these mirror them for the dark theme.
-- Additive and nullable (with one default), so existing rows are untouched:
-- every project simply has no dark-theme banner until one is set, and the
-- header falls back to the plain surface in dark mode meanwhile.
ALTER TABLE "projects" ADD COLUMN "bannerPresetDark" TEXT;
ALTER TABLE "projects" ADD COLUMN "bannerImageIdDark" TEXT;
ALTER TABLE "projects" ADD COLUMN "bannerImageMimeDark" TEXT;
ALTER TABLE "projects" ADD COLUMN "bannerImageUrlDark" TEXT;
ALTER TABLE "projects" ADD COLUMN "bannerPositionYDark" INTEGER NOT NULL DEFAULT 50;
