CREATE TABLE `institution_leases` (
  `name` text PRIMARY KEY NOT NULL,
  `holder` text NOT NULL,
  `acquired_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `expires_at` integer NOT NULL
);
