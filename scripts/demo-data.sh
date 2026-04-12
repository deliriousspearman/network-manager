#!/usr/bin/env bash
# Populates the application with realistic example data for demo purposes.
# Requires the server to be running on localhost:3001.

set -e

API="http://localhost:3001/api"

# ── Helpers ────────────────────────────────────────────────────────────────────

info()    { echo "  $*"; }
success() { echo "✓ $*"; }
error()   { echo "✗ $*" >&2; exit 1; }
header()  { echo; echo "── $* ──"; }

# POST JSON, return response body
post() {
  local url="$1" data="$2"
  curl -sf -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null \
    || { echo "✗ POST $url failed" >&2; return 1; }
}

# PUT JSON, return response body
put() {
  local url="$1" data="$2"
  curl -sf -X PUT -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null \
    || { echo "✗ PUT $url failed" >&2; return 1; }
}

# Extract "id" from a JSON response (works without jq)
extract_id() {
  grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*'
}

# ── Preflight checks ──────────────────────────────────────────────────────────

header "Checking server"

if ! curl -sf "$API/projects" > /dev/null 2>&1; then
  error "Server is not running at $API. Start it first (systemctl --user start network-manager)"
fi
success "Server is reachable"

# Check if demo project already exists
EXISTING=$(curl -sf "$API/projects" 2>/dev/null)
if echo "$EXISTING" | grep -q '"slug":"home-lab"'; then
  error "Demo project 'home-lab' already exists. Run scripts/clean.sh first or delete it manually."
fi

# ── Create project ─────────────────────────────────────────────────────────────

header "Creating project"

PID=$(post "$API/projects" '{
  "name": "Home Lab",
  "slug": "home-lab",
  "description": "Example home network with management, server, and IoT VLANs"
}' | extract_id)

if [[ -z "$PID" ]]; then error "Failed to create project"; fi
success "Project 'Home Lab' created (id: $PID)"

P="$API/projects/$PID"

# ── Create subnets ─────────────────────────────────────────────────────────────

header "Creating subnets"

MGMT_ID=$(post "$P/subnets" '{
  "name": "Management",
  "cidr": "10.0.1.0/24",
  "vlan_id": 10,
  "description": "Network infrastructure and admin devices"
}' | extract_id)
success "Subnet: Management (id: $MGMT_ID)"

SRV_ID=$(post "$P/subnets" '{
  "name": "Servers",
  "cidr": "10.0.2.0/24",
  "vlan_id": 20,
  "description": "Application and storage servers"
}' | extract_id)
success "Subnet: Servers (id: $SRV_ID)"

IOT_ID=$(post "$P/subnets" '{
  "name": "IoT",
  "cidr": "10.0.3.0/24",
  "vlan_id": 30,
  "description": "Smart home and IoT devices"
}' | extract_id)
success "Subnet: IoT (id: $IOT_ID)"

# ── Create devices ─────────────────────────────────────────────────────────────

header "Creating devices"

# Management VLAN devices
ROUTER_ID=$(post "$P/devices" "{
  \"name\": \"Core Router\",
  \"type\": \"router\",
  \"os\": \"pfSense 2.7\",
  \"hosting_type\": \"baremetal\",
  \"subnet_id\": $MGMT_ID,
  \"location\": \"Network Rack\",
  \"notes\": \"Main gateway and DHCP server for all VLANs\",
  \"status\": \"up\",
  \"ips\": [
    {\"ip_address\": \"10.0.1.1\", \"label\": \"LAN\", \"is_primary\": true},
    {\"ip_address\": \"192.168.1.1\", \"label\": \"WAN\"}
  ]
}" | extract_id)
success "Device: Core Router (id: $ROUTER_ID)"

SWITCH_ID=$(post "$P/devices" "{
  \"name\": \"Core Switch\",
  \"type\": \"switch\",
  \"os\": \"UniFi OS 3.2\",
  \"hosting_type\": \"baremetal\",
  \"subnet_id\": $MGMT_ID,
  \"location\": \"Network Rack\",
  \"notes\": \"24-port managed PoE switch\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.1.2\", \"label\": \"Management\", \"is_primary\": true}]
}" | extract_id)
success "Device: Core Switch (id: $SWITCH_ID)"

AP_ID=$(post "$P/devices" "{
  \"name\": \"WiFi AP\",
  \"type\": \"access_point\",
  \"os\": \"UniFi 7.1\",
  \"hosting_type\": \"baremetal\",
  \"subnet_id\": $MGMT_ID,
  \"location\": \"Living Room Ceiling\",
  \"notes\": \"UniFi U6 Pro - provides SSIDs for all VLANs\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.1.3\", \"label\": \"Management\", \"is_primary\": true}]
}" | extract_id)
success "Device: WiFi AP (id: $AP_ID)"

FW_ID=$(post "$P/devices" "{
  \"name\": \"Firewall\",
  \"type\": \"firewall\",
  \"os\": \"OPNsense 24.7\",
  \"hosting_type\": \"baremetal\",
  \"subnet_id\": $MGMT_ID,
  \"location\": \"Network Rack\",
  \"notes\": \"Perimeter firewall with IDS/IPS\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.1.254\", \"label\": \"LAN\", \"is_primary\": true}]
}" | extract_id)
success "Device: Firewall (id: $FW_ID)"

WS_ID=$(post "$P/devices" "{
  \"name\": \"Workstation\",
  \"type\": \"workstation\",
  \"os\": \"Windows 11 Pro\",
  \"hosting_type\": \"baremetal\",
  \"subnet_id\": $MGMT_ID,
  \"location\": \"Office\",
  \"notes\": \"Primary workstation\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.1.100\", \"label\": \"Ethernet\", \"is_primary\": true}]
}" | extract_id)
success "Device: Workstation (id: $WS_ID)"

# Server VLAN devices
PROX_ID=$(post "$P/devices" "{
  \"name\": \"Proxmox-01\",
  \"type\": \"server\",
  \"os\": \"Proxmox VE 8.2\",
  \"hosting_type\": \"hypervisor\",
  \"subnet_id\": $SRV_ID,
  \"location\": \"Server Rack\",
  \"notes\": \"Primary hypervisor - 64GB RAM, 2TB NVMe\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.2.10\", \"label\": \"Management\", \"is_primary\": true}]
}" | extract_id)
success "Device: Proxmox-01 (id: $PROX_ID)"

DOCKER_ID=$(post "$P/devices" "{
  \"name\": \"Docker Host\",
  \"type\": \"server\",
  \"os\": \"Ubuntu 24.04 LTS\",
  \"hosting_type\": \"vm\",
  \"hypervisor_id\": $PROX_ID,
  \"subnet_id\": $SRV_ID,
  \"location\": \"Proxmox-01\",
  \"notes\": \"Runs Portainer, Traefik, and application containers\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.2.11\", \"label\": \"Primary\", \"is_primary\": true}]
}" | extract_id)
success "Device: Docker Host (id: $DOCKER_ID)"

NAS_ID=$(post "$P/devices" "{
  \"name\": \"NAS\",
  \"type\": \"nas\",
  \"os\": \"TrueNAS Scale 24.04\",
  \"hosting_type\": \"baremetal\",
  \"subnet_id\": $SRV_ID,
  \"location\": \"Server Rack\",
  \"notes\": \"4x8TB RAIDZ2 - SMB/NFS shares\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.2.20\", \"label\": \"Primary\", \"is_primary\": true}]
}" | extract_id)
success "Device: NAS (id: $NAS_ID)"

PIHOLE_ID=$(post "$P/devices" "{
  \"name\": \"Pi-hole\",
  \"type\": \"server\",
  \"os\": \"Debian 12\",
  \"hosting_type\": \"vm\",
  \"hypervisor_id\": $PROX_ID,
  \"subnet_id\": $SRV_ID,
  \"location\": \"Proxmox-01\",
  \"notes\": \"DNS ad-blocker and local DNS resolver\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.2.30\", \"label\": \"Primary\", \"is_primary\": true}]
}" | extract_id)
success "Device: Pi-hole (id: $PIHOLE_ID)"

# IoT VLAN devices
HA_ID=$(post "$P/devices" "{
  \"name\": \"Home Assistant\",
  \"type\": \"iot\",
  \"os\": \"HAOS 13.0\",
  \"hosting_type\": \"baremetal\",
  \"subnet_id\": $IOT_ID,
  \"location\": \"Utility Closet\",
  \"notes\": \"Home automation hub - Zigbee and Z-Wave\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.3.10\", \"label\": \"Primary\", \"is_primary\": true}]
}" | extract_id)
success "Device: Home Assistant (id: $HA_ID)"

CAM_ID=$(post "$P/devices" "{
  \"name\": \"Security Camera\",
  \"type\": \"camera\",
  \"hosting_type\": \"baremetal\",
  \"subnet_id\": $IOT_ID,
  \"location\": \"Front Door\",
  \"notes\": \"PoE IP camera - RTSP stream\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.3.20\", \"label\": \"Primary\", \"is_primary\": true}]
}" | extract_id)
success "Device: Security Camera (id: $CAM_ID)"

THERM_ID=$(post "$P/devices" "{
  \"name\": \"Smart Thermostat\",
  \"type\": \"iot\",
  \"hosting_type\": \"baremetal\",
  \"subnet_id\": $IOT_ID,
  \"location\": \"Hallway\",
  \"notes\": \"Ecobee - managed via Home Assistant\",
  \"status\": \"up\",
  \"ips\": [{\"ip_address\": \"10.0.3.30\", \"label\": \"WiFi\", \"is_primary\": true}]
}" | extract_id)
success "Device: Smart Thermostat (id: $THERM_ID)"

# ── Create connections ─────────────────────────────────────────────────────────

header "Creating connections"

post "$P/connections" "{
  \"source_device_id\": $ROUTER_ID,
  \"target_device_id\": $SWITCH_ID,
  \"label\": \"Trunk\",
  \"connection_type\": \"ethernet\",
  \"source_port\": \"eth1\",
  \"target_port\": \"port 1\"
}" > /dev/null
success "Connection: Core Router → Core Switch"

post "$P/connections" "{
  \"source_device_id\": $SWITCH_ID,
  \"target_device_id\": $AP_ID,
  \"label\": \"PoE\",
  \"connection_type\": \"ethernet\",
  \"source_port\": \"port 24\",
  \"target_port\": \"eth0\"
}" > /dev/null
success "Connection: Core Switch → WiFi AP"

post "$P/connections" "{
  \"source_device_id\": $ROUTER_ID,
  \"target_device_id\": $FW_ID,
  \"label\": \"WAN\",
  \"connection_type\": \"ethernet\",
  \"source_port\": \"eth0\",
  \"target_port\": \"LAN\"
}" > /dev/null
success "Connection: Core Router → Firewall"

post "$P/connections" "{
  \"source_device_id\": $SWITCH_ID,
  \"target_device_id\": $PROX_ID,
  \"label\": \"10G\",
  \"connection_type\": \"ethernet\",
  \"source_port\": \"SFP+ 1\",
  \"target_port\": \"eth0\"
}" > /dev/null
success "Connection: Core Switch → Proxmox-01"

post "$P/connections" "{
  \"source_device_id\": $SWITCH_ID,
  \"target_device_id\": $NAS_ID,
  \"label\": \"10G\",
  \"connection_type\": \"ethernet\",
  \"source_port\": \"SFP+ 2\",
  \"target_port\": \"eth0\"
}" > /dev/null
success "Connection: Core Switch → NAS"

post "$P/connections" "{
  \"source_device_id\": $PROX_ID,
  \"target_device_id\": $DOCKER_ID,
  \"label\": \"vmbr0\",
  \"connection_type\": \"ethernet\"
}" > /dev/null
success "Connection: Proxmox-01 → Docker Host"

post "$P/connections" "{
  \"source_device_id\": $PROX_ID,
  \"target_device_id\": $PIHOLE_ID,
  \"label\": \"vmbr0\",
  \"connection_type\": \"ethernet\"
}" > /dev/null
success "Connection: Proxmox-01 → Pi-hole"

post "$P/connections" "{
  \"source_device_id\": $SWITCH_ID,
  \"target_device_id\": $WS_ID,
  \"connection_type\": \"ethernet\",
  \"source_port\": \"port 12\",
  \"target_port\": \"eth0\"
}" > /dev/null
success "Connection: Core Switch → Workstation"

post "$P/connections" "{
  \"source_device_id\": $SWITCH_ID,
  \"target_device_id\": $HA_ID,
  \"connection_type\": \"ethernet\",
  \"source_port\": \"port 20\"
}" > /dev/null
success "Connection: Core Switch → Home Assistant"

post "$P/connections" "{
  \"source_device_id\": $SWITCH_ID,
  \"target_device_id\": $CAM_ID,
  \"label\": \"PoE\",
  \"connection_type\": \"ethernet\",
  \"source_port\": \"port 21\"
}" > /dev/null
success "Connection: Core Switch → Security Camera"

post "$P/connections" "{
  \"source_device_id\": $HA_ID,
  \"target_device_id\": $THERM_ID,
  \"label\": \"Zigbee\",
  \"connection_type\": \"ethernet\"
}" > /dev/null
success "Connection: Home Assistant → Smart Thermostat"

# ── Create credentials ─────────────────────────────────────────────────────────

header "Creating credentials"

post "$P/credentials" "{
  \"device_id\": $ROUTER_ID,
  \"username\": \"admin\",
  \"password\": \"demo-password-123\",
  \"type\": \"HTTP\",
  \"host\": \"https://10.0.1.1\",
  \"source\": \"Default admin account\"
}" > /dev/null
success "Credential: Core Router web admin"

post "$P/credentials" "{
  \"device_id\": $PROX_ID,
  \"username\": \"root\",
  \"password\": \"demo-password-456\",
  \"type\": \"SSH\",
  \"host\": \"10.0.2.10\",
  \"source\": \"Root SSH access\"
}" > /dev/null
success "Credential: Proxmox-01 SSH"

post "$P/credentials" "{
  \"device_id\": $PIHOLE_ID,
  \"username\": \"admin\",
  \"password\": \"pihole-demo\",
  \"type\": \"HTTP\",
  \"host\": \"http://10.0.2.30/admin\",
  \"source\": \"Pi-hole web interface\"
}" > /dev/null
success "Credential: Pi-hole web admin"

# ── Create device ports ────────────────────────────────────────────────────────

header "Creating device ports"

for port_info in "22:OPEN:ssh" "443:OPEN:https" "53:OPEN:domain"; do
  IFS=: read -r num state svc <<< "$port_info"
  post "$P/devices/$ROUTER_ID/ports" "{\"port_number\": $num, \"state\": \"$state\", \"service\": \"$svc\"}" > /dev/null
done
success "Ports: Core Router (22, 443, 53)"

for port_info in "22:OPEN:ssh" "8006:OPEN:proxmox-web" "3128:OPEN:spice-proxy"; do
  IFS=: read -r num state svc <<< "$port_info"
  post "$P/devices/$PROX_ID/ports" "{\"port_number\": $num, \"state\": \"$state\", \"service\": \"$svc\"}" > /dev/null
done
success "Ports: Proxmox-01 (22, 8006, 3128)"

for port_info in "22:OPEN:ssh" "80:OPEN:http" "443:OPEN:https" "9443:OPEN:portainer"; do
  IFS=: read -r num state svc <<< "$port_info"
  post "$P/devices/$DOCKER_ID/ports" "{\"port_number\": $num, \"state\": \"$state\", \"service\": \"$svc\"}" > /dev/null
done
success "Ports: Docker Host (22, 80, 443, 9443)"

for port_info in "80:OPEN:http" "53:OPEN:domain"; do
  IFS=: read -r num state svc <<< "$port_info"
  post "$P/devices/$PIHOLE_ID/ports" "{\"port_number\": $num, \"state\": \"$state\", \"service\": \"$svc\"}" > /dev/null
done
success "Ports: Pi-hole (80, 53)"

for port_info in "445:OPEN:microsoft-ds" "139:OPEN:netbios-ssn" "22:OPEN:ssh" "9000:OPEN:truenas-web"; do
  IFS=: read -r num state svc <<< "$port_info"
  post "$P/devices/$NAS_ID/ports" "{\"port_number\": $num, \"state\": \"$state\", \"service\": \"$svc\"}" > /dev/null
done
success "Ports: NAS (445, 139, 22, 9000)"

# ── Auto-generate diagram layout ──────────────────────────────────────────────

header "Generating diagram"

post "$P/diagram/auto-generate" '{}' > /dev/null
success "Auto-layout applied"

# Add annotation
post "$P/diagram/annotations" '{
  "x": 50,
  "y": -50,
  "text": "Home Lab Network",
  "font_size": 24,
  "color": "#3b82f6"
}' > /dev/null
success "Annotation: 'Home Lab Network'"

# ── Highlight rules ────────────────────────────────────────────────────────────

header "Creating highlight rules"

post "$P/highlight-rules" '{"keyword": "OPEN", "category": "port_state", "color": "#22c55e", "text_color": "#ffffff"}' > /dev/null
success "Highlight rule: OPEN (green)"

post "$P/highlight-rules" '{"keyword": "CLOSED", "category": "port_state", "color": "#ef4444", "text_color": "#ffffff"}' > /dev/null
success "Highlight rule: CLOSED (red)"

post "$P/highlight-rules" '{"keyword": "FILTERED", "category": "port_state", "color": "#f59e0b", "text_color": "#ffffff"}' > /dev/null
success "Highlight rule: FILTERED (amber)"

# ── Create timeline entries ────────────────────────────────────────────────────

header "Creating timeline entries"

post "$P/timeline" '{
  "title": "Project created",
  "description": "Initial setup of the Home Lab network documentation.",
  "category": "milestone",
  "event_date": "2025-01-15"
}' > /dev/null
success "Timeline: Project created"

post "$P/timeline" '{
  "title": "Core network deployed",
  "description": "Installed pfSense router, UniFi switch, and configured VLANs 10/20/30.",
  "category": "change",
  "event_date": "2025-01-20"
}' > /dev/null
success "Timeline: Core network deployed"

post "$P/timeline" '{
  "title": "Decided on Proxmox over ESXi",
  "description": "Chose Proxmox VE for virtualisation — free, open source, and supports both KVM and LXC. ESXi free tier was too limited.",
  "category": "decision",
  "event_date": "2025-02-01"
}' > /dev/null
success "Timeline: Proxmox decision"

post "$P/timeline" '{
  "title": "NAS intermittent disk errors",
  "description": "Drive 3 showing SMART warnings. Ordered replacement. RAIDZ2 still healthy with one degraded disk.",
  "category": "incident",
  "event_date": "2025-03-10"
}' > /dev/null
success "Timeline: NAS disk incident"

post "$P/timeline" '{
  "title": "IoT VLAN isolated from servers",
  "description": "Added firewall rules to block IoT subnet from reaching the server VLAN directly. Only DNS and NTP allowed.",
  "category": "change",
  "event_date": "2025-03-15"
}' > /dev/null
success "Timeline: IoT isolation"

post "$P/timeline" '{
  "title": "Pi-hole DNS blocking live",
  "description": "Pi-hole VM deployed and set as primary DNS for all VLANs. Blocking ads and telemetry across the network.",
  "category": "milestone",
  "event_date": "2025-02-10"
}' > /dev/null
success "Timeline: Pi-hole live"

# ── Create agents ─────────────────────────────────────────────────────────────

header "Creating agents"

post "$P/agents" "{
  \"name\": \"Wazuh Agent\",
  \"agent_type\": \"wazuh\",
  \"device_id\": $DOCKER_ID,
  \"checkin_schedule\": \"every 60s\",
  \"config\": \"<ossec_config>\\n  <client>\\n    <server>\\n      <address>10.0.2.50</address>\\n      <port>1514</port>\\n    </server>\\n  </client>\\n</ossec_config>\",
  \"disk_path\": \"/var/ossec\",
  \"status\": \"active\",
  \"version\": \"4.7.2\"
}" > /dev/null
success "Agent: Wazuh on Docker Host"

post "$P/agents" "{
  \"name\": \"Zabbix Agent\",
  \"agent_type\": \"zabbix\",
  \"device_id\": $PROX_ID,
  \"checkin_schedule\": \"every 30s\",
  \"config\": \"Server=10.0.2.50\\nServerActive=10.0.2.50\\nHostname=proxmox-01\\nEnableRemoteCommands=1\",
  \"disk_path\": \"/etc/zabbix\",
  \"status\": \"active\",
  \"version\": \"6.4.12\"
}" > /dev/null
success "Agent: Zabbix on Proxmox-01"

post "$P/agents" "{
  \"name\": \"Prometheus Node Exporter\",
  \"agent_type\": \"prometheus\",
  \"device_id\": $NAS_ID,
  \"checkin_schedule\": \"every 15s\",
  \"config\": \"--web.listen-address=:9100\\n--collector.filesystem\\n--collector.diskstats\\n--collector.zfs\",
  \"disk_path\": \"/usr/local/bin/node_exporter\",
  \"status\": \"active\",
  \"version\": \"1.7.0\"
}" > /dev/null
success "Agent: Prometheus on NAS"

post "$P/agents" "{
  \"name\": \"Filebeat\",
  \"agent_type\": \"elk\",
  \"device_id\": $PIHOLE_ID,
  \"checkin_schedule\": \"every 10s\",
  \"config\": \"filebeat.inputs:\\n  - type: log\\n    paths:\\n      - /var/log/pihole.log\\noutput.elasticsearch:\\n  hosts: [\\\"10.0.2.50:9200\\\"]\",
  \"disk_path\": \"/etc/filebeat\",
  \"status\": \"active\",
  \"version\": \"8.12.1\"
}" > /dev/null
success "Agent: Filebeat on Pi-hole"

# ── Summary ────────────────────────────────────────────────────────────────────

header "Done!"
echo
echo "  Demo project 'Home Lab' has been populated with:"
echo "    • 3 subnets (Management, Servers, IoT)"
echo "    • 12 devices across all subnets"
echo "    • 11 connections"
echo "    • 3 credentials"
echo "    • Device ports for key servers"
echo "    • 3 highlight rules"
echo "    • 6 timeline entries"
echo "    • 4 agents"
echo "    • Auto-generated network diagram with annotation"
echo
echo "  Open the app and navigate to the 'Home Lab' project to explore."
echo
