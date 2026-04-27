// Size and row caps used by routes. Grouped semantically so adjusting a
// category (e.g. "small images") touches one constant instead of every file.

const KB = 1024;
const MB = 1024 * 1024;

// Byte caps
export const ICON_MAX_BYTES = 512 * KB;           // diagram icons, agent type icons
export const SMALL_IMAGE_MAX_BYTES = 2 * MB;      // diagram-embedded images, drawio imports, image library
export const PROFILE_IMAGE_MAX_BYTES = 5 * MB;    // device images, project images
export const CREDENTIAL_FILE_MAX_BYTES = 5 * MB;
export const ATTACHMENT_MAX_BYTES = 10 * MB;
export const DEVICE_IMPORT_MAX_BYTES = 10 * MB;   // CSV / Nmap / similar text imports
export const RAW_OUTPUT_MAX_BYTES = 50 * MB;      // raw command outputs, router configs

// Row caps
export const UNPAGINATED_DEVICES_CAP = 5000;       // legacy /devices unpaginated mode
export const SQL_QUERY_MAX_ROWS = 1000;            // user-supplied SELECT limit
