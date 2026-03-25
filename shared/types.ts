// Device types
export type DeviceType = 'server' | 'workstation' | 'router' | 'switch' | 'nas' | 'firewall' | 'access_point' | 'iot' | 'camera' | 'phone';

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  server: 'Server',
  workstation: 'Workstation',
  router: 'Router',
  switch: 'Switch',
  nas: 'NAS',
  firewall: 'Firewall',
  access_point: 'Access Point',
  iot: 'IoT Device',
  camera: 'Camera',
  phone: 'Phone',
};
export type CommandType = 'ps' | 'netstat' | 'last' | 'ip_a' | 'mount' | 'ip_r' | 'freeform' | 'systemctl_status';
export type ConnectionType = 'ethernet' | 'wifi' | 'vpn' | 'fiber' | 'serial';
export type HostingType = 'baremetal' | 'vm' | 'hypervisor';

export interface Subnet {
  id: number;
  name: string;
  cidr: string;
  vlan_id: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: number;
  name: string;
  type: DeviceType;
  mac_address: string | null;
  os: string | null;
  location: string | null;
  notes: string | null;
  subnet_id: number | null;
  hosting_type: HostingType | null;
  hypervisor_id: number | null;
  section_config: string | null;
  rich_notes: string | null;
  av: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceImage {
  id: number;
  device_id: number;
  filename: string;
  mime_type: string;
  created_at: string;
}

export interface DeviceAttachment {
  id: number;
  device_id: number;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface DevicePort {
  id: number;
  device_id: number;
  port_number: number;
  state: string;
  service: string | null;
  created_at: string;
}

export interface DeviceIp {
  id: number;
  device_id: number;
  ip_address: string;
  label: string | null;
  is_primary: number;
}

export interface DeviceWithIps extends Device {
  ips: DeviceIp[];
  tags: string[];
  subnet_name?: string | null;
  primary_ip?: string | null;
  hypervisor_name?: string | null;
  credential_count?: number;
  vms?: { id: number; name: string; type: string; os: string | null; primary_ip: string | null }[];
}

export interface Connection {
  id: number;
  source_device_id: number | null;
  target_device_id: number | null;
  source_subnet_id: number | null;
  target_subnet_id: number | null;
  label: string | null;
  connection_type: string;
  edge_type: string;
  source_handle: string | null;
  target_handle: string | null;
  source_port: string | null;
  target_port: string | null;
  edge_color: string | null;
  edge_width: number | null;
  label_color: string | null;
  label_bg_color: string | null;
  created_at: string;
}

export interface CommandOutput {
  id: number;
  device_id: number;
  command_type: CommandType;
  raw_output: string;
  captured_at: string;
  title: string | null;
}

export interface ParsedProcess {
  id: number;
  output_id: number;
  pid: number;
  user: string;
  cpu_percent: number;
  mem_percent: number;
  command: string;
}

export interface ParsedNetConnection {
  id: number;
  output_id: number;
  protocol: string;
  local_addr: string;
  foreign_addr: string;
  state: string;
  pid_program: string;
}

export interface ParsedLogin {
  id: number;
  output_id: number;
  user: string;
  terminal: string;
  source_ip: string;
  login_time: string;
  duration: string;
}

export interface ParsedInterface {
  id: number;
  output_id: number;
  interface_name: string;
  state: string;
  ip_addresses: string; // JSON array
  mac_address: string;
}

export interface ParsedMount {
  id: number;
  output_id: number;
  device: string;
  mount_point: string;
  fs_type: string;
  options: string;
}

export interface ParsedRoute {
  id: number;
  output_id: number;
  destination: string;
  gateway: string;
  device: string;
  protocol: string;
  scope: string;
  metric: string;
}

export interface ParsedService {
  id: number;
  output_id: number;
  unit_name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

export interface CommandOutputWithParsed extends CommandOutput {
  parsed_processes?: ParsedProcess[];
  parsed_connections?: ParsedNetConnection[];
  parsed_logins?: ParsedLogin[];
  parsed_interfaces?: ParsedInterface[];
  parsed_mounts?: ParsedMount[];
  parsed_routes?: ParsedRoute[];
  parsed_services?: ParsedService[];
}

// Diagram types
export interface DiagramDeviceNode {
  id: number;
  name: string;
  type: DeviceType;
  primary_ip: string | null;
  os: string | null;
  subnet_id: number | null;
  hosting_type: HostingType | null;
  mac_address: string | null;
  location: string | null;
  notes: string | null;
  ips: { ip_address: string; label: string | null; is_primary: number }[];
  x: number;
  y: number;
  has_credentials: boolean;
  status: string | null;
}

export interface DiagramSubnetNode {
  id: number;
  name: string;
  cidr: string;
  vlan_id: number | null;
  description: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SubnetMembership {
  device_id: number;
  subnet_id: number;
}

export interface NodePrefs {
  borderColor?: string;
  bgColor?: string;
  labelColor?: string;
  icon?: string;
  favourite?: boolean;
  borderStyle?: string;
  borderRadius?: string;
  borderWidth?: string;
}

export interface LegendItem {
  icon: string;
  label: string;
}

export interface DiagramView {
  id: number;
  project_id: number;
  name: string;
  is_default: number;
  created_at: string;
}

export interface DiagramAnnotation {
  id: number;
  project_id: number;
  x: number;
  y: number;
  text: string;
  font_size: number;
  color: string | null;
  view_id: number | null;
  created_at: string;
}

export interface DiagramImage {
  id: number;
  project_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  filename: string;
  mime_type: string;
  label: string | null;
  view_id: number | null;
  created_at: string;
}

export interface DiagramData {
  devices: DiagramDeviceNode[];
  subnets: DiagramSubnetNode[];
  connections: Connection[];
  subnet_memberships: SubnetMembership[];
  node_preferences: Record<string, NodePrefs>;
  legend_items: LegendItem[];
  annotations: DiagramAnnotation[];
  views: DiagramView[];
  current_view_id: number;
  device_icon_overrides: number[];
  type_default_icons: string[];
  diagram_images: DiagramImage[];
}

// API request types
export interface CreateDeviceRequest {
  name: string;
  type: DeviceType;
  mac_address?: string;
  os?: string;
  location?: string;
  notes?: string;
  subnet_id?: number | null;
  hosting_type?: HostingType | null;
  hypervisor_id?: number | null;
  ips?: { ip_address: string; label?: string; is_primary?: boolean }[];
  tags?: string[];
  section_config?: string;
  rich_notes?: string;
  av?: string;
  status?: string;
}

export interface CreateSubnetRequest {
  name: string;
  cidr: string;
  vlan_id?: number;
  description?: string;
}

export interface CreateConnectionRequest {
  source_device_id?: number;
  target_device_id?: number;
  source_subnet_id?: number;
  target_subnet_id?: number;
  label?: string;
  connection_type?: string;
  source_handle?: string;
  target_handle?: string;
  source_port?: string;
  target_port?: string;
}

export interface SubmitCommandOutputRequest {
  command_type: CommandType;
  raw_output: string;
  title?: string;
}

export interface AppSettings {
  timezone: string;
  notification_enabled?: string;
  notification_text?: string;
  notification_bg_color?: string;
  notification_text_color?: string;
  notification_height?: string;
  notification_font_size?: string;
  notification_bold?: string;
}

export interface UpdatePositionsRequest {
  devices?: { id: number; x: number; y: number }[];
  subnets?: { id: number; x: number; y: number; width: number; height: number }[];
}

export interface HighlightRule {
  id: number;
  keyword: string;
  category: string;
  color: string;
  text_color: string | null;
  created_at: string;
}

export const CREDENTIAL_TYPES = ['SSH', 'RDP', 'HTTP', 'SNMP', 'SQL', 'VPN', 'SSH Key', 'Other'] as const;
export type CredentialType = typeof CREDENTIAL_TYPES[number];

export interface Credential {
  id: number;
  device_id: number | null;
  host: string | null;
  username: string;
  password: string | null;
  type: string | null;
  source: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CredentialWithDevice extends Credential {
  device_name: string | null;
  has_file: boolean;
}

export interface CreateCredentialRequest {
  device_id?: number | null;
  host?: string;
  username: string;
  password?: string;
  type?: string;
  source?: string;
  file_name?: string;
  file_data?: string;
}

export interface ProjectStats {
  device_count: number;
  favourite_count: number;
  subnet_count: number;
  credential_count: number;
}

// Project types
export interface Project {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  about_title: string | null;
  device_count?: number;
  subnet_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  slug?: string;
  description?: string;
  about_title?: string;
}
