-- Migration 071's predecessor approach seeded `device_type_icons` rows
-- pointing at the network2018 library on every project. That approach was
-- replaced by changing the actual fallback in the client (DeviceNode.tsx +
-- DeviceIconsTab.tsx) to network2018 URLs directly — so "Reset" on a per-type
-- icon now correctly returns to network2018 instead of the bundled SVG.
--
-- Clean up the seeded rows so they no longer shadow the new fallback.
-- Only deletes rows that exactly match a seed entry AND have NULL color, to
-- preserve any per-project color customization the user added on top.

DELETE FROM device_type_icons
WHERE icon_source = 'library'
  AND library_id = 'network2018'
  AND color IS NULL
  AND (
    (device_type = 'server'       AND library_icon_key = 'server') OR
    (device_type = 'workstation'  AND library_icon_key = 'pc') OR
    (device_type = 'router'       AND library_icon_key = 'router') OR
    (device_type = 'switch'       AND library_icon_key = 'switch') OR
    (device_type = 'nas'          AND library_icon_key = 'nas') OR
    (device_type = 'firewall'     AND library_icon_key = 'firewall') OR
    (device_type = 'access_point' AND library_icon_key = 'wireless_access_point') OR
    (device_type = 'camera'       AND library_icon_key = 'camera') OR
    (device_type = 'phone'        AND library_icon_key = 'phone')
  );
