CREATE UNIQUE INDEX `process_assignments_active_uq` ON `process_assignments` (`process_id`) WHERE `status` in ('attempting', 'accepted', 'running');
