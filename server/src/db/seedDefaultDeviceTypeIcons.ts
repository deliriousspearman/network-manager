// Deprecated. The previous approach seeded a `device_type_icons` row for each
// project pointing at the network2018 library. That made network2018 show up
// as the default, but it also meant the user's "Reset" button removed the
// row and the bundled SVG took over again — confusing.
//
// Replaced by changing the actual fallback in DeviceNode and DeviceIconsTab
// to network2018 URLs directly. No DB rows are needed; "Reset" now genuinely
// returns to the (network2018) default.
//
// File kept as a stub to avoid breaking any external import; safe to delete
// in a future cleanup.

export function seedDefaultDeviceTypeIconsForProject(): void { /* no-op */ }
export function seedDefaultDeviceTypeIcons(): void { /* no-op */ }
